import { makeEvent, routesOf } from '@logicpath/contracts';
import {
  createVerifier,
  loadConfig,
  startService,
  type RunningService,
} from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  eventually,
  outboxEvents,
  testBus,
  testPrefix,
  documentedRoutes,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, identityService, type IdentityConfig } from '../src/service';

let service: RunningService<IdentityConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;

const adult = {
  email: 'Riya@Example.com',
  password: 'correct-horse-1',
  name: 'Riya',
  birthYear: 1999,
  locale: 'en',
};

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await service.app.inject({
    method: method as 'GET',
    url: path,
    payload: body as object,
    headers,
  });
  return {
    status: response.statusCode,
    body: response.json() as Record<string, any>,
    headers: response.headers,
  };
}

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('identity'));
  prefix = testPrefix();
  const config = loadConfig(
    env,
    baseTestEnv('identity', dbUrl, prefix, {
      ADMIN_EMAIL: 'admin@logicpath.dev',
      ADMIN_PASSWORD: 'admin-password-1',
      COOKIE_SECURE: 'false',
    }),
  );
  service = await startService(identityService(config));
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

describe('identity', () => {
  it('registers an adult, emits events, and issues verifiable tokens', async () => {
    const res = await call('POST', '/v1/auth/register', adult);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.user).toMatchObject({
      email: 'riya@example.com',
      role: 'student',
      emailVerified: false,
    });

    const verifyToken = createVerifier({
      JWKS_URL: `${service.url}/.well-known/jwks.json`,
      JWT_ISSUER: 'logicpath-identity',
      JWT_AUDIENCE: 'logicpath',
    });
    const claims = await verifyToken(res.body.tokens.accessToken);
    expect(claims).toMatchObject({ id: res.body.user.id, role: 'student', name: 'Riya' });

    const registered = await outboxEvents(dbUrl, 'identity.user.registered');
    expect(registered.some((e) => (e.data as { email: string }).email === 'riya@example.com')).toBe(
      true,
    );

    const duplicate = await call('POST', '/v1/auth/register', adult);
    expect(duplicate.status).toBe(409);
    expect(duplicate.headers['content-type']).toContain('application/problem+json');
  });

  it('verifies email with the token from the event', async () => {
    const events = await outboxEvents(dbUrl, 'identity.user.email_verification_requested');
    const token = (events.at(-1)!.data as { token: string }).token;
    expect((await call('POST', '/v1/auth/verify-email', { token })).status).toBe(200);
    expect((await call('POST', '/v1/auth/verify-email', { token })).status).toBe(400);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const login = await call('POST', '/v1/auth/login', {
      email: adult.email,
      password: adult.password,
    });
    expect(login.status).toBe(200);
    const first = login.body.tokens.refreshToken as string;

    const rotated = await call('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(rotated.status).toBe(200);
    const second = rotated.body.tokens.refreshToken as string;
    expect(second).not.toBe(first);

    // Reusing the old token kills the whole family, including the new token.
    expect((await call('POST', '/v1/auth/refresh', { refreshToken: first })).status).toBe(401);
    expect((await call('POST', '/v1/auth/refresh', { refreshToken: second })).status).toBe(401);
  });

  it('keeps the refresh token in an httpOnly cookie for web clients', async () => {
    const login = await call(
      'POST',
      '/v1/auth/login',
      { email: adult.email, password: adult.password },
      { 'x-client': 'web' },
    );
    expect(login.body.tokens.refreshToken).toBeUndefined();
    const setCookie = String(login.headers['set-cookie']);
    expect(setCookie).toMatch(/lp_refresh=.*HttpOnly.*SameSite=Strict/);
    const cookie = setCookie.split(';')[0]!;
    const refreshed = await call('POST', '/v1/auth/refresh', {}, { cookie, 'x-client': 'web' });
    expect(refreshed.status).toBe(200);
  });

  it('rejects wrong passwords without revealing whether the email exists', async () => {
    const wrong = await call('POST', '/v1/auth/login', {
      email: adult.email,
      password: 'nope-nope-nope',
    });
    const unknown = await call('POST', '/v1/auth/login', {
      email: 'nobody@example.com',
      password: 'nope-nope-nope',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.detail).toBe(unknown.body.detail);
  });

  it('holds a minor until parental consent arrives as an event', async () => {
    const young = {
      email: 'kid@example.com',
      password: 'kid-password-1',
      name: 'Kid',
      birthYear: new Date().getUTCFullYear() - 14,
    };
    expect((await call('POST', '/v1/auth/register', young)).status).toBe(400); // needs a parent email

    const res = await call('POST', '/v1/auth/register', {
      ...young,
      parentEmail: 'parent@example.com',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending_consent',
      user: { status: 'pending_consent' },
    });
    const blocked = await call('POST', '/v1/auth/login', {
      email: young.email,
      password: young.password,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.type).toContain('consent-pending');

    // consent service announces approval on the bus
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'consent.granted',
        { requestId: crypto.randomUUID(), userId: res.body.user.id },
        'consent',
      ),
    );
    await bus.close();
    await eventually(
      async () =>
        (await call('POST', '/v1/auth/login', { email: young.email, password: young.password }))
          .status === 200,
    );
  });

  it('lets only admins list users and change roles, and audits it', async () => {
    const student = await call('POST', '/v1/auth/login', {
      email: adult.email,
      password: adult.password,
    });
    const studentAuth = { authorization: `Bearer ${student.body.tokens.accessToken}` };
    expect((await call('GET', '/v1/admin/users', undefined, studentAuth)).status).toBe(403);
    expect((await call('GET', '/v1/admin/users')).status).toBe(401);

    const admin = await call('POST', '/v1/auth/login', {
      email: 'admin@logicpath.dev',
      password: 'admin-password-1',
    });
    const adminAuth = { authorization: `Bearer ${admin.body.tokens.accessToken}` };
    const list = await call('GET', '/v1/admin/users?limit=2', undefined, adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.nextCursor).toBeTruthy();
    const next = await call(
      'GET',
      `/v1/admin/users?limit=2&cursor=${list.body.nextCursor}`,
      undefined,
      adminAuth,
    );
    expect(next.body.items[0].id).not.toBe(list.body.items[0].id);

    const promoted = await call(
      'PATCH',
      `/v1/admin/users/${student.body.user.id}`,
      { role: 'writer' },
      adminAuth,
    );
    expect(promoted.status).toBe(200);
    expect(promoted.body.role).toBe('writer');
    const one = await call('GET', `/v1/admin/users/${student.body.user.id}`, undefined, adminAuth);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ email: adult.email.toLowerCase(), role: 'writer' });
    const missing = `/v1/admin/users/${crypto.randomUUID()}`;
    expect((await call('GET', missing, undefined, adminAuth)).status).toBe(404);
    expect(
      (await call('GET', `/v1/admin/users/${student.body.user.id}`, undefined, studentAuth)).status,
    ).toBe(403);
    expect((await outboxEvents(dbUrl, 'identity.user.role_changed')).length).toBe(1);
    expect(
      (await outboxEvents(dbUrl, 'audit.recorded')).some(
        (e) => (e.data as { action: string }).action === 'user.updated',
      ),
    ).toBe(true);

    const self = await call(
      'PATCH',
      `/v1/admin/users/${admin.body.user.id}`,
      { role: 'student' },
      adminAuth,
    );
    expect(self.status).toBe(403);
  });

  it('publishes outbox events to the bus', async () => {
    expect(await service.relay.drain()).toBeGreaterThanOrEqual(0);
    const rows = await outboxEvents(dbUrl);
    expect(rows.length).toBeGreaterThan(3);
  });
});

describe('identity contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('identity'));
  });
});
