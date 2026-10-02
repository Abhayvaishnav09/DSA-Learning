import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { ContentBundle, Item } from '@logicpath/content-schema';
import {
  learning,
  makeEvent,
  routesOf,
  type EventData,
  type EventType,
} from '@logicpath/contracts';
import { correctAnswer } from '@logicpath/grader';
import { env as progressEnv, progressService } from '@logicpath/progress-service/src/service';
import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  documentedRoutes,
  eventually,
  outboxEvents,
  testBus,
  testKeys,
  testPrefix,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, practiceService, type PracticeConfig } from '../src/service';

const bundleFile = createRequire(import.meta.url).resolve('@logicpath/content/bundle.json');
const bundle = JSON.parse(readFileSync(bundleFile, 'utf8')) as ContentBundle;
const plain = Object.values(bundle.items).find(
  (i) => i.concept === 'loops.counter' && !i.explainWhy,
)!;

let practice: RunningService<PracticeConfig>;
let progress: Awaited<ReturnType<typeof startProgress>>;
let practiceDb: { url: string; drop: () => Promise<void> };
let progressDb: { url: string; drop: () => Promise<void> };
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;

async function startProgress(db: string, tokenKey: string) {
  return startService(
    progressService(
      loadConfig(
        progressEnv,
        baseTestEnv('progress', db, testPrefix(), {
          JWT_PUBLIC_JWK: tokenKey,
          CONTENT_BUNDLE_PATH: bundleFile,
          PRUNE_EVERY_SECONDS: '0',
        }),
      ),
    ),
  );
}

const practiceEnv = (db: string, progressUrl: string, extra: Record<string, string> = {}) =>
  loadConfig(
    env,
    baseTestEnv('practice', db, prefix, {
      JWT_PUBLIC_JWK: keys.publicJwk,
      CONTENT_BUNDLE_PATH: bundleFile,
      PROGRESS_URL: progressUrl,
      ...extra,
    }),
  );

beforeAll(async () => {
  keys = await testKeys();
  prefix = testPrefix();
  practiceDb = await createTestDatabase('practice');
  progressDb = await createTestDatabase('practice_progress');
  progress = await startProgress(progressDb.url, keys.publicJwk);
  practice = await startService(practiceService(practiceEnv(practiceDb.url, progress.url)));
});

afterAll(async () => {
  await practice?.stop();
  await progress?.stop();
  await practiceDb?.drop();
  await progressDb?.drop();
});

const call = async (
  svc: { app: RunningService<PracticeConfig>['app'] },
  method: string,
  url: string,
  token?: string,
  body?: unknown,
) => {
  const res = await svc.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};
const answer = (token: string | undefined, body: unknown) =>
  call(practice, 'POST', '/v1/practice/attempts', token, body);
const mapOf = async (userId: string) =>
  (await call(progress, 'GET', '/v1/progress', await keys.token(userId, 'student'))).body;

const request = (
  item: Item,
  patch: Partial<learning.AttemptRequest> = {},
): learning.AttemptRequest => ({
  id: crypto.randomUUID(),
  itemId: item.id,
  answer: correctAnswer(item) as learning.AttemptRequest['answer'],
  hintLevel: 0,
  durationMs: 20_000,
  source: 'lesson',
  explainOption: null,
  solutionShown: false,
  attemptNo: 1,
  at: new Date().toISOString(),
  ...patch,
});
const mismatched = (item: Item): learning.AttemptRequest['answer'] =>
  item.type === 'mcq' ? { type: 'predict-output', text: 'x' } : { type: 'mcq', option: 0 };
const wrongAnswer = (item: Item): learning.AttemptRequest['answer'] => {
  const right = correctAnswer(item);
  switch (right.type) {
    case 'mcq':
      return { type: 'mcq', option: right.option === 0 ? 1 : 0 };
    case 'arrange-steps':
      return { type: 'arrange-steps', order: [...right.order].reverse() };
    case 'fill-blank':
      return { type: 'fill-blank', blanks: right.blanks.map(() => 'zzz') };
    default:
      return { type: 'predict-output', text: 'zzz' };
  }
};

const events = async (type: EventType, userId: string) =>
  (await outboxEvents(practiceDb.url, type)).filter(
    (e) => (e.data as { userId: string }).userId === userId,
  );

describe('answering', () => {
  const asha = crypto.randomUUID();

  it('grades on the server, records it, and the learner’s progress moves', async () => {
    const token = await keys.token(asha, 'student');
    const req = request(plain, { hintLevel: 1 });
    const res = await answer(token, req);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      attemptId: req.id,
      correct: true,
      duplicate: false,
      xpAwarded: 7,
      concept: { conceptId: 'loops.counter', status: 'learning' },
    });
    expect(learning.AttemptResult.safeParse(res.body).success).toBe(true);

    const recorded = await events('practice.attempt.recorded', asha);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.data).toMatchObject({
      attemptId: req.id,
      itemId: plain.id,
      conceptId: 'loops.counter',
      contentVersion: 1,
      correct: true,
      hintLevel: 1,
      source: 'lesson',
      solutionShown: false,
      xp: [{ amount: 7, reason: 'attempt' }],
    });
    const completed = await events('practice.item.completed', asha);
    expect(completed).toHaveLength(1);
    expect(completed[0]!.data).toMatchObject({
      itemId: plain.id,
      firstTryCorrect: true,
      hintLevel: 1,
      solutionShown: false,
    });

    const map = await mapOf(asha);
    expect(
      map.concepts.find((c: { conceptId: string }) => c.conceptId === 'loops.counter'),
    ).toMatchObject({ attempts: 1 });
  });

  it('counts a retried answer once, and does not pay for it twice', async () => {
    const token = await keys.token(asha, 'student');
    const req = request(plain);
    const first = await answer(token, req);
    const again = await answer(token, req);
    expect(first.body.duplicate).toBe(false);
    expect(again.body).toMatchObject({
      attemptId: req.id,
      correct: true,
      duplicate: true,
      xpAwarded: 0,
    });
    expect(
      (await events('practice.attempt.recorded', asha)).filter(
        (e) => (e.data as { attemptId: string }).attemptId === req.id,
      ),
    ).toHaveLength(1);
    expect(
      (await mapOf(asha)).concepts.find(
        (c: { conceptId: string }) => c.conceptId === 'loops.counter',
      ).attempts,
    ).toBe(2);
  });

  it('tells a wrong answer from a right one and pays nothing', async () => {
    const user = crypto.randomUUID();
    const res = await answer(
      await keys.token(user, 'student'),
      request(plain, { answer: wrongAnswer(plain) }),
    );
    expect(res.body).toMatchObject({ correct: false, xpAwarded: 0 });
    expect(await events('practice.item.completed', user)).toHaveLength(0);
    expect((await events('practice.attempt.recorded', user))[0]!.data).toMatchObject({
      correct: false,
      xp: [],
    });
  });

  it('refuses answers of the wrong kind, unknown questions, strangers’ ids and signed-out visitors', async () => {
    const token = await keys.token(asha, 'student');
    expect((await answer(token, request(plain, { answer: mismatched(plain) }))).status).toBe(400);
    expect(
      (await answer(token, { ...request(plain), itemId: 'loops.counter.no-such-question' })).status,
    ).toBe(404);
    expect((await answer(undefined, request(plain))).status).toBe(401);
    expect((await answer(token, { ...request(plain), hintLevel: 9 })).status).toBe(400);
    // an attempt id that belongs to someone else's answer
    const mine = request(plain);
    await answer(token, mine);
    const other = await keys.token(crypto.randomUUID(), 'student');
    expect((await answer(other, mine)).status).toBe(409);
  });
});

describe('offline sync', () => {
  it('applies a batch in order and tolerates an answer that was already sent', async () => {
    const user = crypto.randomUUID();
    const token = await keys.token(user, 'student');
    const a = request(plain);
    const b = request(plain, { hintLevel: 2 });
    await answer(token, a);
    const res = await call(practice, 'POST', '/v1/practice/sync', token, {
      attempts: [a, b, request(plain)],
    });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { duplicate: boolean }) => r.duplicate)).toEqual([
      true,
      false,
      false,
    ]);
    expect(res.body.results[1]).toMatchObject({ attemptId: b.id, xpAwarded: 5 });
    expect(
      (await mapOf(user)).concepts.find(
        (c: { conceptId: string }) => c.conceptId === 'loops.counter',
      ).attempts,
    ).toBe(3);
    expect(learning.SyncResult.safeParse(res.body).success).toBe(true);
  });

  it('refuses an empty batch and a batch that is too big', async () => {
    const token = await keys.token(crypto.randomUUID(), 'student');
    expect(
      (await call(practice, 'POST', '/v1/practice/sync', token, { attempts: [] })).status,
    ).toBe(400);
    expect(
      (
        await call(practice, 'POST', '/v1/practice/sync', token, {
          attempts: Array.from({ length: 101 }, () => request(plain)),
        })
      ).status,
    ).toBe(400);
  });
});

describe('when the progress service is away', () => {
  it('says to try again, keeps nothing, and works on the retry', async () => {
    const down = await startService(
      practiceService(practiceEnv(practiceDb.url, 'http://127.0.0.1:9', {})),
    );
    try {
      const user = crypto.randomUUID();
      const token = await keys.token(user, 'student');
      const req = request(plain);
      const failed = await call(down, 'POST', '/v1/practice/attempts', token, req);
      expect(failed.status).toBe(503);
      expect(failed.body.type).toContain('unavailable');
      expect(await events('practice.attempt.recorded', user)).toHaveLength(0);
      // once it is back, the same answer goes through
      const retried = await answer(token, req);
      expect(retried.status).toBe(200);
      expect(retried.body.duplicate).toBe(false);
    } finally {
      await down.stop();
    }
  });
});

describe('privacy', () => {
  it('exports and then erases a learner’s answers', async () => {
    const user = crypto.randomUUID();
    await answer(await keys.token(user, 'student'), request(plain));
    const exported = await practice.app.inject({
      method: 'GET',
      url: `/internal/users/${user}/export`,
      headers: { 'x-internal-token': practice.ctx.config.INTERNAL_TOKEN },
    });
    expect(exported.json().data.attempts).toHaveLength(1);
    expect(
      (await practice.app.inject({ method: 'GET', url: `/internal/users/${user}/export` }))
        .statusCode,
    ).toBe(403);
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'privacy.deletion.requested',
        { requestId: crypto.randomUUID(), userId: user } as EventData<'privacy.deletion.requested'>,
        'consent',
      ),
    );
    await bus.close();
    await eventually(async () => (await events('privacy.deletion.completed', user)).length === 1);
    const { rows } = await practice.ctx.database.pool.query(
      'SELECT 1 FROM attempts WHERE user_id = $1',
      [user],
    );
    expect(rows).toEqual([]);
  });
});

describe('practice contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(practice.app)).toEqual(routesOf('practice'));
  });
});
