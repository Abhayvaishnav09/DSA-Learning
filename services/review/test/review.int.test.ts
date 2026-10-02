import {
  learning,
  makeEvent,
  routesOf,
  type EventData,
  type EventType,
} from '@logicpath/contracts';
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
import { env, reviewService, type ReviewConfig } from '../src/service';

let service: RunningService<ReviewConfig>;
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
  ({ url: dbUrl, drop } = await createTestDatabase('review'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    reviewService(
      loadConfig(env, baseTestEnv('review', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk })),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const call = async (method: string, url: string, token?: string) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

const completed = (
  userId: string,
  cardId: string,
  patch: Partial<EventData<'practice.item.completed'>> = {},
) =>
  publish('practice.item.completed', {
    userId,
    itemId: cardId,
    cardId,
    conceptId: 'loops.counter',
    firstTryCorrect: true,
    hintLevel: 0,
    durationMs: 20_000,
    expectedMs: 30_000,
    solutionShown: false,
    at: new Date().toISOString(),
    ...patch,
  });

const scheduled = async (userId: string) =>
  (await outboxEvents(dbUrl, 'review.card.scheduled')).filter(
    (e) => (e.data as { userId: string }).userId === userId,
  );

describe('scheduling', () => {
  const asha = crypto.randomUUID();

  it('turns a finished question into a card, due a day or more later', async () => {
    await completed(asha, 'loops.counter.how-many');
    await eventually(async () => (await scheduled(asha)).length === 1);
    const event = (await scheduled(asha))[0]!;
    expect(event.data).toMatchObject({ userId: asha, cardId: 'loops.counter.how-many' });
    expect(Date.parse((event.data as { due: string }).due)).toBeGreaterThan(
      Date.now() + 20 * 3600_000,
    );

    const summary = await call('GET', '/v1/reviews/summary', await keys.token(asha, 'student'));
    expect(summary.body).toMatchObject({ dueNow: 0, total: 1 });
    expect(summary.body.nextDueAt).toBe((event.data as { due: string }).due);
    expect(learning.ReviewSummary.safeParse(summary.body).success).toBe(true);
  });

  it('moves the card further out each time it is remembered', async () => {
    const first = (await scheduled(asha))[0]!.data as { due: string };
    // the same question again, a week later
    await completed(asha, 'loops.counter.how-many', {
      at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await eventually(async () => (await scheduled(asha)).length === 2);
    const second = (await scheduled(asha))[1]!.data as { due: string };
    expect(Date.parse(second.due) - (Date.now() + 7 * 86_400_000)).toBeGreaterThan(
      Date.parse(first.due) - Date.now(),
    );
    const { rows } = await service.ctx.database.pool.query(
      "SELECT card->>'reps' AS reps FROM cards WHERE user_id = $1",
      [asha],
    );
    expect(rows).toEqual([{ reps: '2' }]);
  });

  it('ignores a finished question older than the last review of its card', async () => {
    await completed(asha, 'loops.counter.how-many', {
      at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await new Promise((r) => setTimeout(r, 700));
    expect((await scheduled(asha)).length).toBe(2);
  });

  it('brings a question back sooner when the learner needed the answer shown', async () => {
    const easy = crypto.randomUUID();
    const hard = crypto.randomUUID();
    await completed(easy, 'loops.counter.a');
    await completed(hard, 'loops.counter.a', { solutionShown: true });
    await eventually(
      async () => (await scheduled(easy)).length === 1 && (await scheduled(hard)).length === 1,
    );
    const dueOf = async (u: string) =>
      Date.parse(((await scheduled(u))[0]!.data as { due: string }).due);
    expect(await dueOf(hard)).toBeLessThanOrEqual(await dueOf(easy));
  });
});

describe('what is due', () => {
  const user = crypto.randomUUID();
  let token: string;

  it('lists due cards, most overdue first, with the concept they belong to', async () => {
    token = await keys.token(user, 'student');
    for (const [card, concept] of [
      ['q.a', 'loops.counter'],
      ['q.b', 'loops.counter'],
      ['q.c', 'logic.if'],
    ] as const) {
      await completed(user, card, { conceptId: concept });
    }
    await eventually(async () => (await scheduled(user)).length === 3);
    // make them overdue by different amounts
    await service.ctx.database.pool.query(
      `UPDATE cards SET due = now() - (CASE card_id WHEN 'q.a' THEN interval '1 hour' WHEN 'q.b' THEN interval '3 days' ELSE interval '1 day' END),
       card = jsonb_set(card, '{due}', to_jsonb(to_char((now() - (CASE card_id WHEN 'q.a' THEN interval '1 hour' WHEN 'q.b' THEN interval '3 days' ELSE interval '1 day' END)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
       WHERE user_id = $1`,
      [user],
    );
    const res = await call('GET', '/v1/reviews/due', token);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { cardId: string }) => i.cardId)).toEqual(['q.b', 'q.c', 'q.a']);
    expect(res.body.items[0]).toMatchObject({
      itemId: 'q.b',
      conceptId: 'loops.counter',
      state: expect.any(String),
      reps: 1,
    });
    expect(res.body.dueCount).toBe(3);
    expect(learning.DueQueue.safeParse(res.body).success).toBe(true);
    expect((await call('GET', '/v1/reviews/summary', token)).body).toMatchObject({
      dueNow: 3,
      dueToday: 3,
      total: 3,
    });
  });

  it('respects the limit, and says how many more are waiting', async () => {
    const res = await call('GET', '/v1/reviews/due?limit=2', token);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.dueCount).toBe(3);
    expect((await call('GET', '/v1/reviews/due?limit=0', token)).status).toBe(400);
    expect((await call('GET', '/v1/reviews/due?limit=51', token)).status).toBe(400);
  });

  it('shows each learner only their own cards, and nothing to signed-out visitors', async () => {
    expect(
      (await call('GET', '/v1/reviews/due', await keys.token(crypto.randomUUID(), 'student'))).body,
    ).toMatchObject({ items: [], dueCount: 0, nextDueAt: null });
    expect((await call('GET', '/v1/reviews/due')).status).toBe(401);
    expect((await call('GET', '/v1/reviews/summary')).status).toBe(401);
  });
});

describe('for the progress service and privacy', () => {
  const user = crypto.randomUUID();

  it('hands the cards to services next door, and to no one else', async () => {
    await completed(user, 'loops.counter.how-many');
    await eventually(async () => (await scheduled(user)).length === 1);
    const ok = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${user}/cards`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(ok.statusCode).toBe(200);
    expect(Object.keys(ok.json())).toEqual(['loops.counter.how-many']);
    expect(ok.json()['loops.counter.how-many']).toMatchObject({
      itemId: 'loops.counter.how-many',
      reps: 1,
      state: expect.any(String),
    });
    expect(
      (await service.app.inject({ method: 'GET', url: `/internal/users/${user}/cards` }))
        .statusCode,
    ).toBe(403);
  });

  it('forgets a learner when asked to', async () => {
    await publish('privacy.deletion.requested', { requestId: crypto.randomUUID(), userId: user });
    await eventually(async () =>
      (await outboxEvents(dbUrl, 'privacy.deletion.completed')).some(
        (e) => (e.data as { userId: string }).userId === user,
      ),
    );
    const gone = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${user}/cards`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(gone.json()).toEqual({});
  });
});

describe('review contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('review'));
  });
});
