import { makeEvent, routesOf } from '@logicpath/contracts';
import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  eventually,
  outboxEvents,
  testBus,
  testKeys,
  testPrefix,
  documentedRoutes,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, profileService, type ProfileConfig } from '../src/service';

let service: RunningService<ProfileConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('profile'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    profileService(
      loadConfig(env, baseTestEnv('profile', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk })),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const call = async (method: string, url: string, token?: string, body?: unknown) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

describe('profile', () => {
  it('creates a profile when identity announces a new user', async () => {
    const userId = crypto.randomUUID();
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'identity.user.registered',
        {
          userId,
          email: 'a@b.co',
          name: 'Asha',
          role: 'student',
          locale: 'hi-Latn',
          birthYear: 2000,
          minor: false,
          parentEmail: null,
          status: 'active',
        },
        'identity',
      ),
    );
    await bus.close();
    const token = await keys.token(userId, 'student', 'Asha');
    const profile = await eventually(async () => {
      const res = await call('GET', '/v1/me/profile', token);
      return res.body.locale === 'hi-Latn' ? res.body : null;
    });
    expect(profile).toMatchObject({
      displayName: 'Asha',
      timeZone: 'Asia/Kolkata',
      dailyGoalMinutes: 10,
    });
  });

  it('updates settings, validates them, and announces the change', async () => {
    const userId = crypto.randomUUID();
    const token = await keys.token(userId, 'student', 'Ravi');
    const updated = await call('PATCH', '/v1/me/profile', token, {
      timeZone: 'Europe/London',
      dailyGoalMinutes: 20,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      displayName: 'Ravi',
      timeZone: 'Europe/London',
      dailyGoalMinutes: 20,
    });

    const bad = await call('PATCH', '/v1/me/profile', token, {
      timeZone: 'Mars/Base',
      dailyGoalMinutes: 7,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
      'body.dailyGoalMinutes',
      'body.timeZone',
    ]);

    const events = await outboxEvents(dbUrl, 'profile.updated');
    expect(
      events.filter((e) => (e.data as { userId: string }).userId === userId).at(-1)?.data,
    ).toMatchObject({ timeZone: 'Europe/London' });
  });

  it('requires a valid token', async () => {
    expect((await call('GET', '/v1/me/profile')).status).toBe(401);
    expect((await call('GET', '/v1/me/profile', 'not-a-token')).status).toBe(401);
  });

  it('deletes the profile and confirms when deletion is requested', async () => {
    const userId = crypto.randomUUID();
    const token = await keys.token(userId, 'student', 'Del');
    await call('GET', '/v1/me/profile', token);
    const bus = await testBus(prefix);
    const requestId = crypto.randomUUID();
    await bus.publish(makeEvent('privacy.deletion.requested', { requestId, userId }, 'consent'));
    await bus.close();
    await eventually(async () =>
      (await outboxEvents(dbUrl, 'privacy.deletion.completed')).some(
        (e) => (e.data as { requestId: string }).requestId === requestId,
      ),
    );
  });
});

describe('profile contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('profile'));
  });
});
