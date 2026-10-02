import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { ContentBundle, Item } from '@logicpath/content-schema';
import {
  learning,
  makeEvent,
  routesOf,
  type EventData,
  type EventType,
} from '@logicpath/contracts';
import { correctAnswer } from '@logicpath/grader';
import { gradeAttempt } from '@logicpath/progress-rules';
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
import { env, progressService, type ProgressConfig } from '../src/service';

const bundleFile = createRequire(import.meta.url).resolve('@logicpath/content/bundle.json');
const bundle = JSON.parse(readFileSync(bundleFile, 'utf8')) as ContentBundle;
const plain = Object.values(bundle.items).find(
  (i) => i.concept === 'loops.counter' && !i.explainWhy,
)!;
const withWhy = bundle.items['loops.counter.how-many']!;

let service: RunningService<ProgressConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let review: Server;
let reviewDown = false;
let keys: Awaited<ReturnType<typeof testKeys>>;

async function publish<T extends EventType>(type: T, data: EventData<T>) {
  const bus = await testBus(prefix);
  await bus.publish(makeEvent(type, data, 'test'));
  await bus.close();
}

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('progress'));
  prefix = testPrefix();
  keys = await testKeys();
  review = createServer((req, res) => {
    if (reviewDown) {
      res.writeHead(503).end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        'loops.counter.how-many': {
          itemId: 'loops.counter.how-many',
          due: '2026-10-05T00:00:00.000Z',
          stability: 3,
          difficulty: 5,
          scheduledDays: 3,
          learningSteps: 0,
          reps: 1,
          lapses: 0,
          state: 'review',
          lastReview: '2026-10-02T00:00:00.000Z',
        },
      }),
    );
  });
  await new Promise<void>((resolve) => review.listen(0, '127.0.0.1', resolve));
  service = await startService(
    progressService(
      loadConfig(
        env,
        baseTestEnv('progress', dbUrl, prefix, {
          JWT_PUBLIC_JWK: keys.publicJwk,
          CONTENT_BUNDLE_PATH: bundleFile,
          REVIEW_URL: `http://127.0.0.1:${(review.address() as { port: number }).port}`,
          PRUNE_EVERY_SECONDS: '0',
        }),
      ),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await new Promise((r) => review?.close(r));
  await drop?.();
});

const as = async (userId: string, role: 'student' | 'writer' | 'admin' = 'student') =>
  keys.token(userId, role);

const call = async (method: string, url: string, token?: string, body?: unknown) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

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

/** An answer of the right kind that is not the right answer. */
const wrongAnswer = (item: Item): learning.AttemptRequest['answer'] => {
  const right = correctAnswer(item);
  switch (right.type) {
    case 'mcq':
      return { type: 'mcq', option: right.option === 0 ? 1 : 0 };
    case 'arrange-steps':
      return { type: 'arrange-steps', order: [...right.order].reverse() };
    case 'fill-blank':
      return { type: 'fill-blank', blanks: right.blanks.map(() => 'zzz') };
    case 'predict-output':
      return { type: 'predict-output', text: 'zzz' };
    default:
      return right as learning.AttemptRequest['answer'];
  }
};

/** What the practice service sends: the answer, graded. */
const apply = (userId: string, item: Item, req: learning.AttemptRequest, token = 'internal') =>
  service.app.inject({
    method: 'POST',
    url: `/internal/learners/${userId}/attempts`,
    payload: { request: req, graded: gradeAttempt(item, req) },
    headers: token === 'internal' ? { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN } : {},
  });

describe('applying answers', () => {
  const asha = crypto.randomUUID();

  it('moves mastery, pays XP, starts the streak and reports what finished', async () => {
    const req = request(plain);
    const res = await apply(asha, plain, req);
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(out).toMatchObject({
      duplicate: false,
      concluded: true,
      masteredNow: false,
      xp: [{ amount: 10, reason: 'attempt' }],
      result: {
        correct: true,
        xpAwarded: 10,
        concept: { conceptId: 'loops.counter', status: 'learning' },
      },
    });
    expect(out.completion).toMatchObject({
      cardId: plain.variationOf ?? plain.id,
      firstTryCorrect: true,
      solutionShown: false,
      hintLevel: 0,
    });
    expect(out.result.concept.pKnown).toBeGreaterThan(0);

    const map = await call('GET', '/v1/progress', await as(asha));
    expect(
      map.body.concepts.find((c: { conceptId: string }) => c.conceptId === 'loops.counter'),
    ).toMatchObject({ attempts: 1, status: 'learning' });
    expect(map.body.streak).toMatchObject({ current: 1, longest: 1 });
    expect(map.body.today).toMatchObject({ itemsCompleted: 1, goalMinutes: 10 });
    expect(map.body.contentVersion).toBe(1);

    const streaks = (await outboxEvents(dbUrl, 'progress.streak.updated')).filter(
      (e) => (e.data as { userId: string }).userId === asha,
    );
    expect(streaks).toHaveLength(1);
    expect(streaks[0]!.data).toMatchObject({ current: 1, longest: 1 });
  });

  it('counts a retried answer once', async () => {
    const req = request(plain);
    const first = (await apply(asha, plain, req)).json();
    const again = (await apply(asha, plain, req)).json();
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.result).toEqual(first.result);
    const map = await call('GET', '/v1/progress', await as(asha));
    expect(
      map.body.concepts.find((c: { conceptId: string }) => c.conceptId === 'loops.counter')
        .attempts,
    ).toBe(2);
    // the second answer on the same day does not announce the streak again
    expect(
      (await outboxEvents(dbUrl, 'progress.streak.updated')).filter(
        (e) => (e.data as { userId: string }).userId === asha,
      ),
    ).toHaveLength(1);
  });

  it('pays nothing for a wrong answer and does not conclude the question', async () => {
    const user = crypto.randomUUID();
    const out = (await apply(user, plain, request(plain, { answer: wrongAnswer(plain) }))).json();
    expect(out).toMatchObject({
      concluded: false,
      completion: null,
      xp: [],
      result: { correct: false, xpAwarded: 0 },
    });
    // the attempt still counts as evidence about what the learner knows
    const map = await call('GET', '/v1/progress', await as(user));
    expect(
      map.body.concepts.find((c: { conceptId: string }) => c.conceptId === 'loops.counter')
        .attempts,
    ).toBe(1);
  });

  it('waits for the "why" check before it counts a question as finished', async () => {
    const user = crypto.randomUUID();
    const open = (await apply(user, withWhy, request(withWhy))).json();
    expect(open.concluded).toBe(false);
    expect(open.completion).toBeNull();
    const done = (await apply(user, withWhy, request(withWhy, { explainOption: 0 }))).json();
    expect(done.concluded).toBe(true);
    expect(done.result.explainedCorrectly).not.toBeNull();
  });

  it('announces a mastered concept once, after the learner has proved it on a later day', async () => {
    const user = crypto.randomUUID();
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    let mastered = 0;
    const answer = async (at: string) => {
      const out = (await apply(user, plain, request(plain, { at }))).json();
      if (out.masteredNow) mastered += 1;
      return out;
    };
    for (let i = 0; i < 8; i++) await answer(daysAgo(3));
    expect(mastered).toBe(0); // sure of it, but only on one day
    await answer(daysAgo(0));
    await answer(daysAgo(0));
    expect(mastered).toBe(1);
    const events = (await outboxEvents(dbUrl, 'progress.concept.mastered')).filter(
      (e) => (e.data as { userId: string }).userId === user,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({ conceptId: 'loops.counter' });
    const map = await call('GET', '/v1/progress', await as(user));
    expect(
      map.body.concepts.find((c: { conceptId: string }) => c.conceptId === 'loops.counter'),
    ).toMatchObject({ status: 'mastered' });
  });

  it('keeps simultaneous answers from losing each other', async () => {
    const user = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => apply(user, plain, request(plain))),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const map = await call('GET', '/v1/progress', await as(user));
    expect(
      map.body.concepts.find((c: { conceptId: string }) => c.conceptId === 'loops.counter')
        .attempts,
    ).toBe(10);
  });

  it('is only for the services next door', async () => {
    const req = request(plain);
    expect((await apply(asha, plain, req, 'nobody')).statusCode).toBe(403);
  });

  it('says so when a question does not exist', async () => {
    const req = { ...request(plain), itemId: 'loops.counter.no-such-question' };
    const res = await service.app.inject({
      method: 'POST',
      url: `/internal/learners/${asha}/attempts`,
      payload: {
        request: req,
        graded: {
          correct: true,
          misconception: null,
          parts: null,
          guessProbability: 0.1,
          explainedCorrectly: null,
        },
      },
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('lessons', () => {
  const user = crypto.randomUUID();

  it('remembers where the learner is, and gives them the lesson back finished once', async () => {
    const token = await as(user);
    const saved = await call('PUT', '/v1/progress/lessons/loops.counter', token, {
      beat: 'predict',
      practiceIndex: 0,
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      conceptId: 'loops.counter',
      beat: 'predict',
      completedAt: null,
    });
    const later = await call('PUT', '/v1/progress/lessons/loops.counter', token, {
      beat: 'practice',
      practiceIndex: 2,
    });
    expect(later.body).toMatchObject({
      beat: 'practice',
      practiceIndex: 2,
      startedAt: saved.body.startedAt,
    });

    const done = await call('POST', '/v1/progress/lessons/loops.counter/complete', token);
    expect(done.status).toBe(200);
    expect(done.body.completedAt).not.toBeNull();
    await call('POST', '/v1/progress/lessons/loops.counter/complete', token);
    const completed = (await outboxEvents(dbUrl, 'progress.lesson.completed')).filter(
      (e) => (e.data as { userId: string }).userId === user,
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]!.data).toMatchObject({
      conceptId: 'loops.counter',
      xp: [{ amount: 20, reason: 'lesson' }],
    });
    // a finished lesson stays finished when the learner replays it
    const replay = await call('PUT', '/v1/progress/lessons/loops.counter', token, {
      beat: 'story',
      practiceIndex: 0,
    });
    expect(replay.body.completedAt).toBe(done.body.completedAt);
  });

  it('refuses lessons that do not exist, and signed-out visitors', async () => {
    const token = await as(user);
    expect(
      (await call('PUT', '/v1/progress/lessons/no.such', token, { beat: 'story' })).status,
    ).toBe(404);
    expect((await call('POST', '/v1/progress/lessons/no.such/complete', token)).status).toBe(404);
    expect((await call('GET', '/v1/progress')).status).toBe(401);
    expect(
      (await call('PUT', '/v1/progress/lessons/loops.counter', token, { beat: 'nonsense' })).status,
    ).toBe(400);
  });
});

describe('a new device', () => {
  it('gets the whole state, with the review cards from the review service', async () => {
    const user = crypto.randomUUID();
    await apply(user, plain, request(plain));
    const res = await call('GET', '/v1/progress/state', await as(user));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'cards',
      'concepts',
      'lessons',
      'masteredAt',
      'streak',
    ]);
    expect(res.body.concepts['loops.counter']).toMatchObject({ attempts: 1 });
    expect(res.body.cards['loops.counter.how-many'].state).toBe('review');
    expect(learning.EngineState.safeParse(res.body).success).toBe(true);
  });

  it('says to try again when the cards cannot be loaded', async () => {
    reviewDown = true;
    const res = await call('GET', '/v1/progress/state', await as(crypto.randomUUID()));
    reviewDown = false;
    expect(res.status).toBe(503);
  });
});

describe('settings that change a day', () => {
  it('uses the daily goal from the learner’s profile', async () => {
    const user = crypto.randomUUID();
    await publish('profile.updated', {
      userId: user,
      displayName: 'Goal',
      locale: 'en',
      timeZone: 'Asia/Kolkata',
      dailyGoalMinutes: 30,
    });
    await eventually(
      async () =>
        (await call('GET', '/v1/progress', await as(user))).body.today?.goalMinutes === 30,
    );
  });
});

describe('privacy', () => {
  it('exports and then erases a learner’s record', async () => {
    const user = crypto.randomUUID();
    await apply(user, plain, request(plain));
    const exported = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${user}/export`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(exported.json().data.state.streak.current).toBe(1);
    await publish('privacy.deletion.requested', { requestId: crypto.randomUUID(), userId: user });
    await eventually(async () =>
      (await outboxEvents(dbUrl, 'privacy.deletion.completed')).some(
        (e) => (e.data as { userId: string }).userId === user,
      ),
    );
    const map = await call('GET', '/v1/progress', await as(user));
    expect(map.body.streak.current).toBe(0);
    const { rows } = await service.ctx.database.pool.query(
      'SELECT 1 FROM applied_attempts WHERE user_id = $1',
      [user],
    );
    expect(rows).toEqual([]);
  });
});

describe('progress contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('progress'));
  });
});
