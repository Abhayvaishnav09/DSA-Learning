import {
  makeEvent,
  routesOf,
  engagement,
  type EventData,
  type EventType,
} from '@logicpath/contracts';
import { BADGES, istDate, levelFor, weekStart } from '@logicpath/gamification-rules';
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
import { env, gamificationService, type GamificationConfig } from '../src/service';

let service: RunningService<GamificationConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;

async function publish<T extends EventType>(type: T, data: EventData<T>) {
  const bus = await testBus(prefix);
  await bus.publish(makeEvent(type, data, 'test'));
  await bus.close();
}

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('gamification'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    gamificationService(
      loadConfig(
        env,
        baseTestEnv('gamification', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk }),
      ),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const rewards = async (userId: string) => {
  const res = await service.app.inject({
    method: 'GET',
    url: '/v1/rewards/me',
    headers: { authorization: `Bearer ${await keys.token(userId, 'student')}` },
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

const attempt = (userId: string, patch: Partial<EventData<'practice.attempt.recorded'>> = {}) =>
  publish('practice.attempt.recorded', {
    attemptId: crypto.randomUUID(),
    userId,
    itemId: 'loops.counter.a',
    conceptId: 'loops.counter',
    contentVersion: 1,
    correct: true,
    hintLevel: 0,
    guessProbability: 0.05,
    explainedCorrectly: null,
    misconception: null,
    durationMs: 20_000,
    source: 'lesson',
    solutionShown: false,
    xp: [{ amount: 10, reason: 'attempt' }],
    at: new Date().toISOString(),
    ...patch,
  });

const emitted = async (type: EventType, userId: string) =>
  (await outboxEvents(dbUrl, type)).filter((e) => (e.data as { userId: string }).userId === userId);

describe('XP', () => {
  const asha = crypto.randomUUID();

  it('records what an answer earned, in the week it was earned', async () => {
    await attempt(asha, {
      xp: [
        { amount: 10, reason: 'attempt' },
        { amount: 15, reason: 'daily-goal' },
      ],
    });
    await eventually(async () => (await rewards(asha)).body.xp === 25);
    const res = await rewards(asha);
    expect(res.body).toMatchObject({
      xp: 25,
      level: 1,
      levelFloorXp: 0,
      nextLevelXp: 100,
      xpThisWeek: 25,
    });
    expect(
      res.body.recent.map((r: { amount: number; reason: string }) => `${r.amount} ${r.reason}`),
    ).toEqual(['15 Daily goal reached', '10 Correct answer']);
    expect(engagement.Rewards.safeParse(res.body).success).toBe(true);

    const awarded = await emitted('gamification.xp.awarded', asha);
    expect(awarded.map((e) => (e.data as { amount: number }).amount).sort()).toEqual([10, 15]);
    expect(awarded[0]!.data).toMatchObject({ weekStart: weekStart(istDate(new Date())) });
  });

  it('announces a level the moment it is reached, once', async () => {
    await attempt(asha, { xp: [{ amount: 80, reason: 'streak' }] });
    await eventually(async () => (await emitted('gamification.level.up', asha)).length === 1);
    expect((await emitted('gamification.level.up', asha))[0]!.data).toMatchObject({
      level: levelFor(105),
      xp: 105,
    });
    await attempt(asha, { xp: [{ amount: 5, reason: 'attempt' }] });
    await eventually(async () => (await rewards(asha)).body.xp === 110);
    expect(await emitted('gamification.level.up', asha)).toHaveLength(1);
    expect((await rewards(asha)).body).toMatchObject({
      level: 2,
      levelFloorXp: 100,
      nextLevelXp: 300,
    });
  });

  it('counts only this week as "this week"', async () => {
    const user = crypto.randomUUID();
    await attempt(user, {
      at: new Date(Date.now() - 21 * 86_400_000).toISOString(),
      xp: [{ amount: 50, reason: 'attempt' }],
    });
    await attempt(user, { xp: [{ amount: 7, reason: 'attempt' }] });
    await eventually(async () => (await rewards(user)).body.xp === 57);
    expect((await rewards(user)).body.xpThisWeek).toBe(7);
  });

  it('shows the reasons in the learner’s language', async () => {
    const user = crypto.randomUUID();
    await publish('profile.updated', {
      userId: user,
      displayName: 'Ravi',
      locale: 'hi-Latn',
      timeZone: 'Asia/Kolkata',
      dailyGoalMinutes: 10,
    });
    await attempt(user);
    await eventually(async () => (await rewards(user)).body.xp === 10);
    expect((await rewards(user)).body.recent[0].reason).toBe('Sahi jawab');
  });

  it('knows nothing about a stranger, and nothing to signed-out visitors', async () => {
    expect((await rewards(crypto.randomUUID())).body).toMatchObject({
      xp: 0,
      level: 1,
      badges: [],
      recent: [],
    });
    expect((await service.app.inject({ method: 'GET', url: '/v1/rewards/me' })).statusCode).toBe(
      401,
    );
  });
});

describe('badges', () => {
  it('lists every badge, to anyone', async () => {
    const res = await service.app.inject({ method: 'GET', url: '/v1/rewards/badges' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((b: { id: string }) => b.id)).toEqual(BADGES.map((b) => b.id));
  });

  it('gives a badge for a first right answer, once, and announces it', async () => {
    const user = crypto.randomUUID();
    await attempt(user);
    await eventually(async () => (await rewards(user)).body.badges.length === 1);
    await attempt(user);
    await eventually(async () => (await rewards(user)).body.xp === 20);
    const res = await rewards(user);
    expect(res.body.badges).toEqual([{ id: 'first-answer', earnedAt: expect.any(String) }]);
    expect(await emitted('gamification.badge.earned', user)).toHaveLength(1);
  });

  it('gives no credit for predictions, wrong answers or a shown solution', async () => {
    const user = crypto.randomUUID();
    await attempt(user, { source: 'predict', xp: [{ amount: 3, reason: 'attempt' }] });
    await attempt(user, { correct: false, xp: [] });
    await attempt(user, { solutionShown: true, xp: [] });
    await eventually(async () => (await rewards(user)).body.xp === 3);
    await new Promise((r) => setTimeout(r, 400));
    expect((await rewards(user)).body.badges).toEqual([]);
  });

  it('follows the other services: lessons, mastery, streaks, classes and promotions', async () => {
    const user = crypto.randomUUID();
    const at = new Date().toISOString();
    await publish('progress.lesson.completed', {
      userId: user,
      conceptId: 'loops.counter',
      xp: [{ amount: 20, reason: 'lesson' }],
      at,
    });
    await publish('progress.concept.mastered', { userId: user, conceptId: 'loops.counter', at });
    await publish('progress.streak.updated', {
      userId: user,
      current: 3,
      longest: 3,
      localDate: istDate(new Date()),
    });
    await publish('classroom.member.joined', {
      classId: crypto.randomUUID(),
      userId: user,
      ownerId: crypto.randomUUID(),
      className: 'Grade 8',
    });
    await publish('leaderboard.week.closed', {
      userId: user,
      weekStart: '2026-09-28',
      tier: 'bronze',
      rank: 1,
      result: 'promoted',
    });
    await publish('leaderboard.week.closed', {
      userId: user,
      weekStart: '2026-09-21',
      tier: 'silver',
      rank: 9,
      result: 'stayed',
    });
    await eventually(async () => (await rewards(user)).body.badges.length === 5);
    const ids = (await rewards(user)).body.badges.map((b: { id: string }) => b.id).sort();
    expect(ids).toEqual(['classmate', 'first-lesson', 'first-mastery', 'promoted', 'streak-3']);
    expect((await rewards(user)).body.xp).toBe(20);
    expect(await emitted('gamification.badge.earned', user)).toHaveLength(5);
  });

  it('rewards a clean run of ten right answers without hints', async () => {
    const user = crypto.randomUUID();
    for (let i = 0; i < 10; i++) await attempt(user);
    await eventually(async () =>
      (await rewards(user)).body.badges.some((b: { id: string }) => b.id === 'clean-run'),
    );
    // a hint breaks the run
    const other = crypto.randomUUID();
    for (let i = 0; i < 9; i++) await attempt(other);
    await attempt(other, { hintLevel: 1 });
    await attempt(other);
    await eventually(async () => (await rewards(other)).body.xp === 110);
    expect(
      (await rewards(other)).body.badges.some((b: { id: string }) => b.id === 'clean-run'),
    ).toBe(false);
  }, 60_000);
});

describe('privacy', () => {
  it('exports and then erases a learner’s XP and badges', async () => {
    const user = crypto.randomUUID();
    await attempt(user);
    await eventually(async () => (await rewards(user)).body.xp === 10);
    const exported = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${user}/export`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(exported.json().data).toMatchObject({
      xp: 10,
      ledger: [{ amount: 10 }],
      badges: [{ id: 'first-answer' }],
    });
    await publish('privacy.deletion.requested', { requestId: crypto.randomUUID(), userId: user });
    await eventually(async () => (await emitted('privacy.deletion.completed', user)).length === 1);
    expect((await rewards(user)).body).toMatchObject({ xp: 0, badges: [], recent: [] });
  });
});

describe('gamification contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('gamification'));
  });
});
