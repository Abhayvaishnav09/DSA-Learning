import { makeEvent, routesOf } from '@logicpath/contracts';
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
import { developerService, env, type DeveloperConfig } from '../src/service';

let service: RunningService<DeveloperConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
const ids = {
  adult: crypto.randomUUID(),
  minor: crypto.randomUUID(),
  stranger: crypto.randomUUID(),
  admin: crypto.randomUUID(),
};
let tokens: Record<keyof typeof ids, string>;

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('developer'));
  prefix = testPrefix();
  const keys = await testKeys();
  service = await startService(
    developerService(
      loadConfig(env, baseTestEnv('developer', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk })),
    ),
  );
  tokens = {
    adult: await keys.token(ids.adult, 'student'),
    minor: await keys.token(ids.minor, 'student'),
    stranger: await keys.token(ids.stranger, 'student'),
    admin: await keys.token(ids.admin, 'admin'),
  };
  const year = new Date().getUTCFullYear();
  const bus = await testBus(prefix);
  for (const [userId, birthYear, minor] of [
    [ids.adult, year - 30, false],
    [ids.minor, year - 15, true],
  ] as const) {
    await bus.publish(
      makeEvent(
        'identity.user.registered',
        {
          userId,
          email: `${userId}@example.com`,
          name: 'Someone',
          role: 'student',
          locale: 'en',
          birthYear,
          minor,
          parentEmail: null,
          status: 'active',
        },
        'identity',
      ),
    );
  }
  await bus.close();
  await eventually(async () => {
    const res = await call('POST', '/v1/developer/keys', tokens.minor, {
      name: 'probe',
      scopes: ['curriculum:read'],
    });
    return res.status === 403 && /18/.test(res.body.detail);
  });
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
const internal = (method: string, url: string, body?: unknown) =>
  service.app.inject({
    method: method as 'POST',
    url,
    payload: body as object,
    headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
  });
const verify = async (secret: string) =>
  (
    await internal('POST', '/internal/keys/verify', { secret, scope: 'curriculum:read' })
  ).json() as Record<string, any>;

const create = (token: string, name = 'My site') =>
  call('POST', '/v1/developer/keys', token, { name, scopes: ['curriculum:read'] });

let secret: string;
let keyId: string;

describe('developer keys', () => {
  it('gives an adult a key whose secret is shown once', async () => {
    const res = await create(tokens.adult);
    expect(res.status).toBe(201);
    secret = res.body.secret;
    keyId = res.body.id;
    expect(secret).toMatch(/^lp_live_[A-Za-z0-9_-]{32}$/);
    expect(res.body).toMatchObject({
      name: 'My site',
      plan: 'free',
      dailyQuota: 1000,
      usageToday: 0,
      ownerId: ids.adult,
      prefix: secret.slice(0, 16),
      revokedAt: null,
    });
    const list = await call('GET', '/v1/developer/keys', tokens.adult);
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.items[0].secret).toBeUndefined();
    expect((await outboxEvents(dbUrl, 'developer.key.created')).at(-1)!.data).toMatchObject({
      keyId,
      ownerId: ids.adult,
    });
  });

  it('keeps keys from children, strangers and signed-out visitors', async () => {
    expect((await create(tokens.minor)).status).toBe(403);
    expect((await create(tokens.stranger)).status).toBe(403);
    expect(
      (
        await call('POST', '/v1/developer/keys', undefined, {
          name: 'x y',
          scopes: ['curriculum:read'],
        })
      ).status,
    ).toBe(401);
    expect(
      (await call('POST', '/v1/developer/keys', tokens.adult, { name: 'x', scopes: [] })).status,
    ).toBe(400);
  });

  it('allows five active keys and says so on the sixth', async () => {
    for (let i = 2; i <= 5; i++) expect((await create(tokens.adult, `Key ${i}`)).status).toBe(201);
    const sixth = await create(tokens.adult, 'Key 6');
    expect(sixth.status).toBe(409);
    const list = await call('GET', '/v1/developer/keys', tokens.adult);
    const extra = list.body.items.find((k: { name: string }) => k.name === 'Key 5');
    expect((await call('DELETE', `/v1/developer/keys/${extra.id}`, tokens.adult)).status).toBe(200);
    expect((await create(tokens.adult, 'Key 6')).status).toBe(201);
  });

  it('only lets the owner see, use or revoke a key', async () => {
    expect((await call('GET', `/v1/developer/keys/${keyId}/usage`, tokens.stranger)).status).toBe(
      404,
    );
    expect((await call('DELETE', `/v1/developer/keys/${keyId}`, tokens.stranger)).status).toBe(404);
    expect((await call('GET', '/v1/developer/keys', tokens.stranger)).body.items).toEqual([]);
  });
});

describe('using a key', () => {
  it('is checked by the gateway, which counts the request', async () => {
    expect(
      (
        await service.app.inject({
          method: 'POST',
          url: '/internal/keys/verify',
          payload: { secret },
        })
      ).statusCode,
    ).toBe(403);
    const first = await verify(secret);
    expect(first).toMatchObject({
      valid: true,
      allowed: true,
      keyId,
      plan: 'free',
      dailyQuota: 1000,
      requestsToday: 1,
    });
    expect((await verify(secret)).requestsToday).toBe(2);
    expect(await verify('lp_live_notarealkeyatall000000000000')).toEqual({ valid: false });
    const usage = await call('GET', `/v1/developer/keys/${keyId}/usage`, tokens.adult);
    expect(usage.body.days).toHaveLength(14);
    expect(usage.body.days.at(-1).requests).toBe(2);
    expect(usage.body.days.slice(0, -1).every((d: { requests: number }) => d.requests === 0)).toBe(
      true,
    );
    const list = await call('GET', '/v1/developer/keys', tokens.adult);
    const mine = list.body.items.find((k: { id: string }) => k.id === keyId);
    expect(mine.usageToday).toBe(2);
    expect(mine.lastUsedAt).not.toBeNull();
  });

  it('stops at the daily quota, and an admin can raise it or move the key to another plan', async () => {
    expect(
      (await call('PATCH', `/v1/admin/api-keys/${keyId}`, tokens.adult, { dailyQuota: 3 })).status,
    ).toBe(403);
    const lowered = await call('PATCH', `/v1/admin/api-keys/${keyId}`, tokens.admin, {
      dailyQuota: 3,
    });
    expect(lowered.body).toMatchObject({ dailyQuota: 3, plan: 'free' });
    expect((await verify(secret)).allowed).toBe(true); // 3rd of 3
    expect(await verify(secret)).toMatchObject({ valid: true, allowed: false, requestsToday: 3 });
    const partner = await call('PATCH', `/v1/admin/api-keys/${keyId}`, tokens.admin, {
      plan: 'partner',
    });
    expect(partner.body).toMatchObject({ plan: 'partner', dailyQuota: 50_000 });
    expect((await verify(secret)).allowed).toBe(true);
    const zero = await call('PATCH', `/v1/admin/api-keys/${keyId}`, tokens.admin, {
      dailyQuota: 0,
    });
    expect(zero.body.dailyQuota).toBe(0);
    expect((await verify(secret)).allowed).toBe(false);
    await call('PATCH', `/v1/admin/api-keys/${keyId}`, tokens.admin, { dailyQuota: 1000 });
    expect(
      (
        await call('PATCH', `/v1/admin/api-keys/${crypto.randomUUID()}`, tokens.admin, {
          plan: 'free',
        })
      ).status,
    ).toBe(404);
  });

  it('refuses a key without the scope asked for', async () => {
    const res = (
      await internal('POST', '/internal/keys/verify', { secret, scope: 'admin:everything' })
    ).json();
    expect(res).toEqual({ valid: false });
  });

  it('stops working once revoked, by its owner or by an admin', async () => {
    expect((await call('DELETE', `/v1/developer/keys/${keyId}`, tokens.adult)).status).toBe(200);
    expect(await verify(secret)).toEqual({ valid: false });
    const another = await create(tokens.adult, 'Another');
    expect(
      (await call('POST', `/v1/admin/api-keys/${another.body.id}/revoke`, tokens.adult)).status,
    ).toBe(403);
    expect(
      (await call('POST', `/v1/admin/api-keys/${another.body.id}/revoke`, tokens.admin)).status,
    ).toBe(200);
    expect(await verify(another.body.secret)).toEqual({ valid: false });
    const revoked = await outboxEvents(dbUrl, 'developer.key.revoked');
    expect(revoked.length).toBeGreaterThanOrEqual(3);
    const actions = (await outboxEvents(dbUrl, 'audit.recorded')).map(
      (e) => (e.data as { action: string }).action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['apikey.created', 'apikey.revoked', 'apikey.updated']),
    );
  });
});

describe('the admin view', () => {
  it('lists every key, a page at a time, for admins only', async () => {
    expect((await call('GET', '/v1/admin/api-keys', tokens.adult)).status).toBe(403);
    const first = await call('GET', '/v1/admin/api-keys?limit=3', tokens.admin);
    expect(first.body.items).toHaveLength(3);
    expect(first.body.nextCursor).toBeTruthy();
    const rest = await call(
      'GET',
      `/v1/admin/api-keys?limit=3&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      tokens.admin,
    );
    const ids = [...first.body.items, ...rest.body.items].map((k: { id: string }) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(6);
  });
});

describe('privacy', () => {
  it('exports and then erases a person’s keys', async () => {
    const exported = (await internal('GET', `/internal/users/${ids.adult}/export`)).json();
    expect(exported.service).toBe('developer');
    expect(exported.data.keys.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(exported)).not.toContain('secret');
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'privacy.deletion.requested',
        { requestId: crypto.randomUUID(), userId: ids.adult },
        'consent',
      ),
    );
    await bus.close();
    await eventually(
      async () => (await outboxEvents(dbUrl, 'privacy.deletion.completed')).length > 0,
    );
    expect((await call('GET', '/v1/developer/keys', tokens.adult)).body.items).toEqual([]);
    // and they cannot make a new one: the service no longer knows who they are
    expect((await create(tokens.adult)).status).toBe(403);
  });
});

describe('developer contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('developer'));
  });
});
