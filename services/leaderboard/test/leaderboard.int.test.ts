import {
  engagement,
  makeEvent,
  routesOf,
  type EventData,
  type EventType,
} from '@logicpath/contracts';
import { addDays, istDate, startOfIstDay, weekStart } from '@logicpath/gamification-rules';
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
import { env, leaderboardService, type LeaderboardConfig } from '../src/service';

let service: RunningService<LeaderboardConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;

const thisWeek = weekStart(istDate(new Date()));
const lastWeek = addDays(thisWeek, -7);
const twoWeeksAgo = addDays(thisWeek, -14);

async function publishAll(events: { type: EventType; data: unknown }[]) {
  const bus = await testBus(prefix);
  for (const event of events) await bus.publish(makeEvent(event.type, event.data as never, 'test'));
  await bus.close();
}
const registered = (
  userId: string,
  name: string,
  role: 'student' | 'writer' | 'admin' = 'student',
  status: 'active' | 'pending_consent' = 'active',
) => ({
  type: 'identity.user.registered' as const,
  data: {
    userId,
    email: `${name}@example.com`,
    name,
    role,
    locale: 'en',
    birthYear: 2000,
    minor: status !== 'active',
    parentEmail: null,
    status,
  } satisfies EventData<'identity.user.registered'>,
});
const xp = (userId: string, amount: number, week = thisWeek) => ({
  type: 'gamification.xp.awarded' as const,
  data: {
    userId,
    amount,
    reason: 'attempt',
    weekStart: week,
    at: new Date().toISOString(),
  } satisfies EventData<'gamification.xp.awarded'>,
});

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('leaderboard'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    leaderboardService(
      loadConfig(
        env,
        baseTestEnv('leaderboard', dbUrl, prefix, {
          JWT_PUBLIC_JWK: keys.publicJwk,
          SETTLE_EVERY_SECONDS: '0',
        }),
      ),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const call = async (
  method: string,
  url: string,
  userId?: string,
  role: 'student' | 'writer' | 'admin' = 'student',
  name = 'Test',
) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    headers: userId ? { authorization: `Bearer ${await keys.token(userId, role, name)}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};
const league = (userId: string, name = 'Test') =>
  call('GET', '/v1/leaderboard/league', userId, 'student', name);
const members = async () =>
  (await service.ctx.database.pool.query('SELECT count(*)::int AS n FROM members')).rows[0]
    .n as number;
const settle = async (now?: string) =>
  (
    await service.app.inject({
      method: 'POST',
      url: '/internal/leaderboard/settle',
      payload: now ? { now } : undefined,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    })
  ).json() as { settled: number };
const closed = async () =>
  (await outboxEvents(dbUrl, 'leaderboard.week.closed')).map(
    (e) => e.data as EventData<'leaderboard.week.closed'>,
  );

describe('this week', () => {
  const [asha, ravi, meera] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const teacher = crypto.randomUUID();

  it('puts students in a league, ranks them by this week’s XP, and shows who moves up', async () => {
    await publishAll([
      registered(asha, 'Asha'),
      registered(ravi, 'Ravi'),
      registered(meera, 'Meera'),
      registered(teacher, 'Wasim', 'writer'),
      xp(asha, 40),
      xp(asha, 15),
      xp(ravi, 60),
      xp(meera, 5),
    ]);
    await eventually(async () => (await league(asha)).body.standings?.[0]?.xp === 60);
    const res = await league(asha);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      tier: 'bronze',
      weekStart: thisWeek,
      endsAt: startOfIstDay(addDays(thisWeek, 7)).toISOString(),
    });
    expect(res.body.standings).toEqual([
      { rank: 1, userId: ravi, displayName: 'Ravi', xp: 60, isMe: false, zone: 'promote' },
      { rank: 2, userId: asha, displayName: 'Asha', xp: 55, isMe: true, zone: 'stay' },
      { rank: 3, userId: meera, displayName: 'Meera', xp: 5, isMe: false, zone: 'stay' },
    ]);
    expect(engagement.League.safeParse(res.body).success).toBe(true);
  });

  it('leaves teachers out, and refuses signed-out visitors', async () => {
    const res = await call('GET', '/v1/leaderboard/league', teacher, 'writer', 'Wasim');
    expect(res.body).toMatchObject({ tier: 'bronze', standings: [] });
    expect(await members()).toBe(3);
    expect((await call('GET', '/v1/leaderboard/league')).status).toBe(401);
  });

  it('follows a renamed learner', async () => {
    await publishAll([
      {
        type: 'profile.updated',
        data: {
          userId: meera,
          displayName: 'Meera P.',
          locale: 'en',
          timeZone: 'Asia/Kolkata',
          dailyGoalMinutes: 10,
        },
      },
    ]);
    await eventually(async () =>
      (await league(asha)).body.standings.some(
        (s: { displayName: string }) => s.displayName === 'Meera P.',
      ),
    );
  });

  it('gives a learner a place even before their registration has been announced', async () => {
    const early = crypto.randomUUID();
    const res = await league(early, 'Early Bird');
    await service.ctx.database.pool.query('DELETE FROM members WHERE user_id = $1', [early]);
    expect(res.body.standings).toContainEqual(
      expect.objectContaining({ userId: early, displayName: 'Early Bird', xp: 0, isMe: true }),
    );
  });
});

describe('groups of thirty', () => {
  it('splits a tier into groups in the order people joined', async () => {
    const ids = Array.from({ length: 35 }, () => crypto.randomUUID());
    await publishAll(ids.map((id, i) => registered(id, `Learner ${i}`)));
    await eventually(async () => (await members()) === 38);
    const sizes = new Map<number, number>();
    for (const id of ids) {
      const size = (await league(id)).body.standings.length as number;
      sizes.set(size, (sizes.get(size) ?? 0) + 1);
    }
    // 38 in bronze (3 from before, 35 now): a group of 30 and a group of 8
    expect([...sizes.entries()].sort()).toEqual(expect.arrayContaining([[8, expect.any(Number)]]));
    const total = [...sizes.entries()].reduce(
      (a, [size, n]) => a + (size === 30 ? n : size === 8 ? n : 0),
      0,
    );
    expect(total).toBe(35);
    await service.ctx.database.pool.query("DELETE FROM members WHERE name LIKE 'Learner %'");
  }, 60_000);
});

describe('children waiting for a parent', () => {
  it('are not in a league until a parent approves', async () => {
    const kid = crypto.randomUUID();
    await publishAll([registered(kid, 'Kiran', 'student', 'pending_consent')]);
    await eventually(
      async () =>
        (await service.ctx.database.pool.query('SELECT 1 FROM members WHERE user_id = $1', [kid]))
          .rowCount === 1,
    );
    expect((await league(kid)).body.standings).toEqual([]);
    expect((await settle()).settled).toBeGreaterThanOrEqual(0);
    await publishAll([
      { type: 'consent.granted', data: { requestId: crypto.randomUUID(), userId: kid } },
    ]);
    await eventually(async () => (await league(kid)).body.standings.length >= 1);
    expect(
      (await league(kid)).body.standings.some((s: { userId: string }) => s.userId === kid),
    ).toBe(true);
    // and a child whose parent says no is not kept
    const refused = crypto.randomUUID();
    await publishAll([registered(refused, 'Dev', 'student', 'pending_consent')]);
    await eventually(
      async () =>
        (
          await service.ctx.database.pool.query('SELECT 1 FROM members WHERE user_id = $1', [
            refused,
          ])
        ).rowCount === 1,
    );
    await publishAll([
      { type: 'consent.denied', data: { requestId: crypto.randomUUID(), userId: refused } },
    ]);
    await eventually(
      async () =>
        (
          await service.ctx.database.pool.query('SELECT 1 FROM members WHERE user_id = $1', [
            refused,
          ])
        ).rowCount === 0,
    );
  });
});

describe('closing a week', () => {
  const players = Array.from({ length: 12 }, () => crypto.randomUUID());
  const idle = crypto.randomUUID();

  it('moves the most active up, tells everyone, and ignores people who did nothing', async () => {
    await service.ctx.database.pool.query('DELETE FROM members');
    await service.ctx.database.pool.query('DELETE FROM weekly_xp');
    await publishAll([
      ...players.map((id, i) => registered(id, `Player ${i}`)),
      registered(idle, 'Idle'),
      ...players.map((id, i) => xp(id, (i + 1) * 10, lastWeek)),
    ]);
    await eventually(
      async () =>
        (await members()) === 13 &&
        (await service.ctx.database.pool.query('SELECT count(*)::int AS n FROM weekly_xp')).rows[0]
          .n === 12,
    );

    const first = await settle();
    expect(first.settled).toBeGreaterThanOrEqual(1);
    const events = (await closed()).filter((e) => e.weekStart === lastWeek);
    expect(events).toHaveLength(12); // the idle learner is not ranked
    const promoted = events.filter((e) => e.result === 'promoted').map((e) => e.userId);
    expect(promoted.sort()).toEqual(players.slice(8).sort()); // a group of 12 promotes its top 4
    expect(events.filter((e) => e.result === 'demoted')).toHaveLength(0); // bronze has nowhere lower
    expect(events.find((e) => e.userId === players[11])).toMatchObject({
      rank: 1,
      tier: 'bronze',
      result: 'promoted',
    });

    // the top four are now in silver, by themselves; everyone else stays in bronze
    const top = await league(players[11]!, 'Player 11');
    expect(top.body.tier).toBe('silver');
    expect(top.body.standings.map((s: { userId: string }) => s.userId).sort()).toEqual(
      players.slice(8).sort(),
    );
    expect((await league(players[0]!)).body.tier).toBe('bronze');

    // closing it again changes nothing
    expect((await settle()).settled).toBe(0);
    expect((await closed()).filter((e) => e.weekStart === lastWeek)).toHaveLength(12);
  });

  it('keeps each learner’s past weeks', async () => {
    const res = await call('GET', '/v1/leaderboard/history', players[11]);
    expect(res.body.items).toEqual([
      { weekStart: lastWeek, tier: 'bronze', rank: 1, xp: 120, result: 'promoted' },
    ]);
    expect(engagement.LeagueHistory.safeParse(res.body).success).toBe(true);
    expect((await call('GET', '/v1/leaderboard/history', idle)).body.items).toEqual([]);
    expect((await call('GET', '/v1/leaderboard/history')).status).toBe(401);
  });

  it('moves the least active down from a tier above bronze', async () => {
    // put a full-sized group in silver, then close another week
    await service.ctx.database.pool.query("UPDATE members SET tier = 'silver'");
    await publishAll(players.map((id, i) => xp(id, (i + 1) * 3, twoWeeksAgo)));
    await eventually(
      async () =>
        (
          await service.ctx.database.pool.query(
            'SELECT count(*)::int AS n FROM weekly_xp WHERE week_start = $1',
            [twoWeeksAgo],
          )
        ).rows[0].n === 12,
    );
    expect((await settle()).settled).toBe(1);
    const events = (await closed()).filter((e) => e.weekStart === twoWeeksAgo);
    expect(
      events
        .filter((e) => e.result === 'demoted')
        .map((e) => e.userId)
        .sort(),
    ).toEqual(players.slice(0, 4).sort());
    expect(
      events
        .filter((e) => e.result === 'promoted')
        .map((e) => e.userId)
        .sort(),
    ).toEqual(players.slice(8).sort());
    expect((await league(players[0]!)).body.tier).toBe('bronze');
    expect((await league(players[11]!, 'Player 11')).body.tier).toBe('gold');
  });
});

describe('privacy', () => {
  it('exports and then erases a learner’s league record', async () => {
    const user = crypto.randomUUID();
    await publishAll([registered(user, 'Gone'), xp(user, 10)]);
    await eventually(async () =>
      (await league(user)).body.standings.some(
        (s: { xp: number; isMe: boolean }) => s.isMe && s.xp === 10,
      ),
    );
    const exported = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${user}/export`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(exported.json().data.member).toMatchObject({ userId: user, name: 'Gone' });
    await publishAll([
      {
        type: 'privacy.deletion.requested',
        data: { requestId: crypto.randomUUID(), userId: user },
      },
    ]);
    await eventually(async () =>
      (await outboxEvents(dbUrl, 'privacy.deletion.completed')).some(
        (e) => (e.data as { userId: string }).userId === user,
      ),
    );
    expect(
      (await service.ctx.database.pool.query('SELECT 1 FROM members WHERE user_id = $1', [user]))
        .rowCount,
    ).toBe(0);
  });
});

describe('leaderboard contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('leaderboard'));
  });
});
