import { routesOf } from '@logicpath/contracts';
import { DEFAULT_FLAGS } from '@logicpath/flags-rules';
import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  documentedRoutes,
  outboxEvents,
  testKeys,
  testPrefix,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, flagsService, type FlagsConfig } from '../src/service';

let service: RunningService<FlagsConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let keys: Awaited<ReturnType<typeof testKeys>>;
let tokens: { admin: string; writer: string; student: string };
const adminId = crypto.randomUUID();

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('flags'));
  keys = await testKeys();
  service = await startService(
    flagsService(
      loadConfig(
        env,
        baseTestEnv('flags', dbUrl, testPrefix(), { JWT_PUBLIC_JWK: keys.publicJwk }),
      ),
    ),
  );
  tokens = {
    admin: await keys.token(adminId, 'admin'),
    writer: await keys.token(crypto.randomUUID(), 'writer'),
    student: await keys.token(crypto.randomUUID(), 'student'),
  };
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

const change = (patch: Record<string, unknown> = {}) => ({
  description: 'A new try-out',
  enabled: true,
  rolloutPercent: 100,
  roles: [],
  platforms: [],
  minAppVersion: null,
  value: null,
  ...patch,
});

describe('flags', () => {
  it('starts with the standard flags', async () => {
    const list = await call('GET', '/v1/admin/flags', tokens.admin);
    expect(list.status).toBe(200);
    expect(list.body.items.map((f: { key: string }) => f.key)).toEqual(
      DEFAULT_FLAGS.map((f) => f.key).sort(),
    );
  });

  it('answers signed-out visitors, and applies roles to signed-in people', async () => {
    const anonymous = await call('GET', '/v1/flags');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.flags['map.3d']).toEqual({ on: true, value: null });
    expect(anonymous.body.flags['studio.media'].on).toBe(false);
    expect(anonymous.body.flags['config.daily-goal-options'].value).toEqual([5, 10, 20, 30]);

    const student = await call('GET', '/v1/flags', tokens.student);
    expect(student.body.flags['studio.media'].on).toBe(false);
    const writer = await call('GET', '/v1/flags', tokens.writer);
    expect(writer.body.flags['studio.media'].on).toBe(true);
  });

  it('rolls a flag out to a stable slice of people', async () => {
    const put = await call(
      'PUT',
      '/v1/admin/flags/beta.half',
      tokens.admin,
      change({ rolloutPercent: 50 }),
    );
    expect(put.status).toBe(200);
    let on = 0;
    const total = 60;
    for (let i = 0; i < total; i++) {
      const token = await keys.token(crypto.randomUUID(), 'student');
      // each person gets the same answer every time they ask
      const ask = async () =>
        (await call('GET', '/v1/flags', token)).body.flags['beta.half'].on as boolean;
      const first = await ask();
      expect(await ask()).toBe(first);
      if (first) on += 1;
    }
    expect(on).toBeGreaterThan(total * 0.25);
    expect(on).toBeLessThan(total * 0.75);
  }, 60_000);

  it('limits a flag by platform and app version', async () => {
    await call(
      'PUT',
      '/v1/admin/flags/android.only',
      tokens.admin,
      change({ platforms: ['android'], minAppVersion: '1.4.0', value: { limit: 3 } }),
    );
    const ask = (query: string) => call('GET', `/v1/flags?${query}`);
    expect((await ask('platform=web')).body.flags['android.only'].on).toBe(false);
    expect((await ask('platform=android&appVersion=1.3.9')).body.flags['android.only'].on).toBe(
      false,
    );
    expect((await ask('platform=android&appVersion=1.4.0')).body.flags['android.only']).toEqual({
      on: true,
      value: { limit: 3 },
    });
  });

  it('lets only admins change flags, and records who did', async () => {
    expect((await call('PUT', '/v1/admin/flags/x.y', undefined, change())).status).toBe(401);
    expect((await call('PUT', '/v1/admin/flags/x.y', tokens.writer, change())).status).toBe(403);
    expect((await call('PUT', '/v1/admin/flags/Not A Key', tokens.admin, change())).status).toBe(
      400,
    );

    const created = await call('PUT', '/v1/admin/flags/audit.me', tokens.admin, change());
    expect(created.body).toMatchObject({ key: 'audit.me', enabled: true });
    await call('PUT', '/v1/admin/flags/audit.me', tokens.admin, change({ enabled: false }));
    // the change is visible at once on this replica
    expect((await call('GET', '/v1/flags')).body.flags['audit.me'].on).toBe(false);

    const audits = await outboxEvents(dbUrl, 'audit.recorded');
    const mine = audits.filter((e) => (e.data as { targetId: string }).targetId === 'audit.me');
    expect(mine.map((e) => (e.data as { action: string }).action)).toEqual([
      'flag.created',
      'flag.updated',
    ]);
    expect(mine[0]!.data).toMatchObject({ actorId: adminId, actorRole: 'admin' });
    const changed = await outboxEvents(dbUrl, 'flags.changed');
    expect(changed.some((e) => (e.data as { key: string }).key === 'audit.me')).toBe(true);
  });

  it('deletes a flag, and says so when it is not there', async () => {
    expect((await call('DELETE', '/v1/admin/flags/audit.me', tokens.admin)).status).toBe(200);
    expect((await call('GET', '/v1/flags')).body.flags['audit.me']).toBeUndefined();
    expect((await call('DELETE', '/v1/admin/flags/audit.me', tokens.admin)).status).toBe(404);
    expect((await call('DELETE', '/v1/admin/flags/map.3d', tokens.student)).status).toBe(403);
  });
});

describe('flags contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('flags'));
  });
});
