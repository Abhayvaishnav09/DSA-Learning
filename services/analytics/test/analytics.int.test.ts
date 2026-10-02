import {
  makeEvent,
  platform,
  routesOf,
  type EventData,
  type EventType,
} from '@logicpath/contracts';
import { addDays, istDate } from '@logicpath/gamification-rules';
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
import { analyticsService, env, type AnalyticsConfig } from '../src/service';

let service: RunningService<AnalyticsConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let tokens: Record<'admin' | 'writer' | 'student', string>;

async function publishAll(events: { type: EventType; data: unknown }[]) {
  const bus = await testBus(prefix);
  for (const event of events) await bus.publish(makeEvent(event.type, event.data as never, 'test'));
  await bus.close();
}

/** Noon in India on a day `n` days ago, so "which day" is never a coin toss. */
const dayAt = (n: number) => {
  const day = addDays(istDate(new Date()), -n);
  return new Date(`${day}T06:30:00.000Z`).toISOString(); // 12:00 IST
};

const answer = (
  userId: string,
  itemId: string,
  patch: Partial<EventData<'practice.attempt.recorded'>> = {},
) => ({
  type: 'practice.attempt.recorded' as const,
  data: {
    attemptId: crypto.randomUUID(),
    userId,
    itemId,
    conceptId: itemId.split('.').slice(0, 2).join('.'),
    contentVersion: 1,
    correct: true,
    hintLevel: 0,
    guessProbability: 0.05,
    explainedCorrectly: null,
    misconception: null,
    durationMs: 20_000,
    source: 'lesson',
    solutionShown: false,
    xp: [],
    at: dayAt(0),
    ...patch,
  } satisfies EventData<'practice.attempt.recorded'>,
});

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('analytics'));
  prefix = testPrefix();
  const keys = await testKeys();
  service = await startService(
    analyticsService(
      loadConfig(env, baseTestEnv('analytics', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk })),
    ),
  );
  tokens = {
    admin: await keys.token(crypto.randomUUID(), 'admin'),
    writer: await keys.token(crypto.randomUUID(), 'writer'),
    student: await keys.token(crypto.randomUUID(), 'student'),
  };
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const call = async (url: string, token?: string) => {
  const res = await service.app.inject({
    method: 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};
const facts = async () =>
  (await service.ctx.database.pool.query('SELECT count(*)::int AS n FROM attempt_facts')).rows[0]
    .n as number;

const [asha, ravi, meera] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const registered = (userId: string, role: 'student' | 'writer' = 'student') => ({
  type: 'identity.user.registered' as const,
  data: {
    userId,
    email: `${userId}@example.com`,
    name: 'Someone',
    role,
    locale: 'en',
    birthYear: 2000,
    minor: false,
    parentEmail: null,
    status: 'active',
  } satisfies EventData<'identity.user.registered'>,
});

describe('the admin overview', () => {
  beforeAll(async () => {
    await publishAll([
      registered(asha),
      registered(ravi),
      registered(meera),
      registered(crypto.randomUUID(), 'writer'), // teachers are not learners
      // today: asha 3 answers (2 right), ravi 1 (right)
      answer(asha, 'loops.counter.a'),
      answer(asha, 'loops.counter.a', {
        correct: false,
        misconception: 'loops.counter.off-by-one',
      }),
      answer(asha, 'loops.counter.b', { misconception: 'loops.counter.off-by-one' }),
      answer(ravi, 'loops.counter.a'),
      // three days ago: asha 2 answers (1 right), meera 1 (wrong)
      answer(asha, 'loops.counter.c', {
        at: dayAt(3),
        correct: false,
        misconception: 'loops.counter.early-stop',
      }),
      answer(asha, 'loops.counter.c', { at: dayAt(3) }),
      answer(meera, 'loops.counter.c', {
        at: dayAt(3),
        correct: false,
        misconception: 'loops.counter.off-by-one',
      }),
      // twenty days ago: only inside the 30-day window
      answer(ravi, 'loops.counter.d', { at: dayAt(20) }),
      {
        type: 'progress.lesson.completed' as const,
        data: { userId: asha, conceptId: 'loops.counter', xp: [], at: dayAt(1) },
      },
      {
        type: 'progress.lesson.completed' as const,
        data: { userId: ravi, conceptId: 'loops.counter', xp: [], at: dayAt(0) },
      },
    ]);
    await eventually(
      async () =>
        (await facts()) === 8 &&
        (await service.ctx.database.pool.query('SELECT 1 FROM lesson_completions')).rowCount === 2,
    );
  });

  it('is only for admins', async () => {
    expect((await call('/v1/admin/analytics/overview')).status).toBe(401);
    expect((await call('/v1/admin/analytics/overview', tokens.writer)).status).toBe(403);
    expect((await call('/v1/admin/analytics/overview', tokens.student)).status).toBe(403);
    expect((await call('/v1/admin/analytics/overview?days=6', tokens.admin)).status).toBe(400);
    expect((await call('/v1/admin/analytics/overview?days=91', tokens.admin)).status).toBe(400);
  });

  it('counts answers, right answers and who is active, a day at a time', async () => {
    const res = await call('/v1/admin/analytics/overview?days=7', tokens.admin);
    expect(res.status).toBe(200);
    expect(platform.AdminOverview.safeParse(res.body).success).toBe(true);
    const today = istDate(new Date());
    expect(res.body.attempts).toHaveLength(7);
    expect(res.body.attempts.at(-1)).toEqual({ date: today, value: 4 });
    expect(
      res.body.attempts.find((d: { date: string }) => d.date === addDays(today, -3)).value,
    ).toBe(3);
    expect(
      res.body.attempts.find((d: { date: string }) => d.date === addDays(today, -1)).value,
    ).toBe(0);
    // right answers as a share of all answers, only on days someone answered
    expect(res.body.correctRate.map((d: { date: string }) => d.date)).toEqual([
      addDays(today, -3),
      today,
    ]);
    expect(res.body.correctRate).toEqual([
      { date: addDays(today, -3), value: 33.3 },
      { date: today, value: 75 },
    ]);
    expect(res.body.activeUsers).toEqual({ day: 2, week: 3, month: 3 });
    expect(res.body.lessonsCompleted.at(-1).value).toBe(1);
    expect(res.body.lessonsCompleted.at(-2).value).toBe(1);
    expect(res.body.signups.at(-1).value).toBe(3);
  });

  it('widens to the whole window, and lists the most common mistakes', async () => {
    const res = await call('/v1/admin/analytics/overview?days=30', tokens.admin);
    expect(res.body.attempts).toHaveLength(30);
    expect(res.body.attempts.reduce((sum: number, d: { value: number }) => sum + d.value, 0)).toBe(
      8,
    );
    expect(res.body.activeUsers.month).toBe(3);
    expect(res.body.topMisconceptions).toEqual([
      { id: 'loops.counter.off-by-one', count: 3 },
      { id: 'loops.counter.early-stop', count: 1 },
    ]);
  });

  it('finds the questions people get wrong first time, once enough have tried', async () => {
    // item "e": four learners, only one right on the first try; item "f": four learners, all right
    const users = Array.from({ length: 4 }, () => crypto.randomUUID());
    await publishAll(
      users.flatMap((u, i) => [
        answer(u, 'loops.counter.e', { correct: i === 0 }),
        answer(u, 'loops.counter.f'),
      ]),
    );
    await eventually(async () => (await facts()) === 16);
    const res = await call('/v1/admin/analytics/overview?days=30', tokens.admin);
    expect(res.body.hardestItems[0]).toEqual({
      itemId: 'loops.counter.e',
      attempts: 4,
      firstTryRate: 0.25,
    });
    expect(res.body.hardestItems.at(-1)).toMatchObject({
      itemId: 'loops.counter.f',
      firstTryRate: 1,
    });
    // an item few have tried is not ranked
    expect(
      res.body.hardestItems.some((i: { itemId: string }) => i.itemId === 'loops.counter.d'),
    ).toBe(false);
  });
});

describe('question statistics for writers', () => {
  it('shows how each question performs, hardest first', async () => {
    const res = await call('/v1/studio/analytics/items?conceptId=loops.counter', tokens.writer);
    expect(res.status).toBe(200);
    expect(platform.ItemStats.safeParse(res.body).success).toBe(true);
    const items = res.body.items as {
      itemId: string;
      attempts: number;
      firstTryRate: number;
      topMisconception: string | null;
    }[];
    // c: both learners' first answers were wrong (0%); e: one of four got it first time (25%)
    expect(items.slice(0, 2).map((i) => i.itemId)).toEqual(['loops.counter.c', 'loops.counter.e']);
    const a = items.find((i) => i.itemId === 'loops.counter.a')!;
    // asha, ravi: 3 answers; asha's first try on "a" was right, ravi's too
    expect(a).toMatchObject({
      attempts: 3,
      firstTryRate: 1,
      topMisconception: 'loops.counter.off-by-one',
    });
    const c = items.find((i) => i.itemId === 'loops.counter.c')!;
    // one answer each for two mistakes: the tie goes to the one that sorts first
    expect(c).toMatchObject({ attempts: 3, topMisconception: 'loops.counter.early-stop' });
    expect(c.firstTryRate).toBe(0); // both learners' first answers were wrong
    expect(items.map((i) => i.firstTryRate)).toEqual(
      [...items.map((i) => i.firstTryRate)].sort((x, y) => x - y),
    );
  });

  it('can look at one concept, and is for writers and admins only', async () => {
    expect(
      (await call('/v1/studio/analytics/items?conceptId=logic.if', tokens.writer)).body.items,
    ).toEqual([]);
    expect((await call('/v1/studio/analytics/items', tokens.admin)).status).toBe(200);
    expect((await call('/v1/studio/analytics/items', tokens.student)).status).toBe(403);
    expect((await call('/v1/studio/analytics/items')).status).toBe(401);
  });

  it('ignores predictions, and counts the first try by when it happened, not when it arrived', async () => {
    const user = crypto.randomUUID();
    const early = answer(user, 'loops.counter.g', { at: dayAt(2), correct: false });
    const late = answer(user, 'loops.counter.g', { at: dayAt(1), correct: true });
    const guess = answer(user, 'loops.counter.g', {
      source: 'predict',
      at: dayAt(3),
      correct: true,
    });
    // the later answer reaches the service first (an offline device syncing late)
    await publishAll([late, early, guess]);
    await eventually(async () => (await facts()) === 19);
    const row = (
      await call('/v1/studio/analytics/items?conceptId=loops.counter', tokens.writer)
    ).body.items.find((i: { itemId: string }) => i.itemId === 'loops.counter.g');
    expect(row).toMatchObject({ attempts: 2, firstTryRate: 0 });
  });

  it('never counts the same answer twice', async () => {
    const user = crypto.randomUUID();
    const once = answer(user, 'loops.counter.h');
    await publishAll([once, { type: once.type, data: once.data }]);
    await eventually(async () => (await facts()) === 20);
    await new Promise((r) => setTimeout(r, 400));
    expect(await facts()).toBe(20);
  });
});

describe('privacy', () => {
  it('exports and then erases a learner’s answers', async () => {
    const exported = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${ravi}/export`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(exported.json().data.answers.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(exported.json())).not.toContain(ravi);
    await publishAll([
      {
        type: 'privacy.deletion.requested',
        data: { requestId: crypto.randomUUID(), userId: ravi },
      },
    ]);
    await eventually(
      async () => (await outboxEvents(dbUrl, 'privacy.deletion.completed')).length === 1,
    );
    for (const table of ['attempt_facts', 'signups', 'lesson_completions']) {
      expect(
        (await service.ctx.database.pool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [ravi]))
          .rowCount,
      ).toBe(0);
    }
  });
});

describe('analytics contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('analytics'));
  });
});
