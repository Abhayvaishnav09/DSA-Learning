import { createServer, type Server } from 'node:http';
import {
  makeEvent,
  PRIVACY_SERVICES,
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
import { consentService, env, type ConsentConfig } from '../src/service';

let service: RunningService<ConsentConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let others: Server;
const ids = {
  admin: crypto.randomUUID(),
  adult: crypto.randomUUID(),
  kid1: crypto.randomUUID(),
  kid2: crypto.randomUUID(),
  kid3: crypto.randomUUID(),
  demo: crypto.randomUUID(),
};
let token: Record<'admin' | 'adult' | 'demo', string>;

async function publish<T extends EventType>(type: T, data: EventData<T>) {
  const bus = await testBus(prefix);
  await bus.publish(makeEvent(type, data, 'test'));
  await bus.close();
}

const register = (userId: string, name: string, email: string, parentEmail: string | null = null) =>
  publish('identity.user.registered', {
    userId,
    email,
    name,
    role: 'student',
    locale: 'en',
    birthYear: parentEmail ? 2013 : 1990,
    minor: parentEmail !== null,
    parentEmail,
    status: parentEmail ? 'pending_consent' : 'active',
  });

const call = async (method: string, url: string, tok?: string, body?: unknown) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: tok ? { authorization: `Bearer ${tok}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};
const internal = async (url: string, body?: unknown) =>
  (
    await service.app.inject({
      method: 'POST',
      url,
      payload: body as object,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    })
  ).json() as Record<string, any>;

/** The consent request a parent would have been emailed about, from the event the service wrote. */
async function consentLinkFor(userId: string): Promise<string> {
  const event = await eventually(async () =>
    (await outboxEvents(dbUrl, 'consent.requested')).find(
      (e) => (e.data as { userId: string }).userId === userId,
    ),
  );
  return (event.data as { token: string }).token;
}

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('consent'));
  prefix = testPrefix();
  const keys = await testKeys();

  // Every other service, as one fake: /<service>/internal/users/:id/export. Profile is "down".
  others = createServer((req, res) => {
    const match = /^\/([a-z]+)\/internal\/users\/([^/]+)\/export$/.exec(req.url ?? '');
    if (!match || req.headers['x-internal-token'] !== 'dev-internal-token-change-me') {
      res.writeHead(404).end();
      return;
    }
    if (match[1] === 'profile') {
      res.writeHead(503).end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ service: match[1], data: { owner: match[2], from: match[1] } }));
  });
  await new Promise<void>((resolve) => others.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(others.address() as { port: number }).port}`;
  const urls = Object.fromEntries(
    PRIVACY_SERVICES.map((n) => [`${n.toUpperCase()}_URL`, `${base}/${n}`]),
  );

  service = await startService(
    consentService(
      loadConfig(
        env,
        baseTestEnv('consent', dbUrl, prefix, {
          JWT_PUBLIC_JWK: keys.publicJwk,
          EXPIRE_EVERY_SECONDS: '0',
          ...urls,
        }),
      ),
    ),
  );
  token = {
    admin: await keys.token(ids.admin, 'admin'),
    adult: await keys.token(ids.adult, 'student'),
    demo: await keys.token(ids.demo, 'student'),
  };
  await register(ids.adult, 'Adult', 'adult@example.com');
  await register(ids.demo, 'Demo', 'student@demo.logicpath.dev');
  await register(ids.kid1, 'Kiran', 'kiran@example.com', 'parent1@example.com');
});

afterAll(async () => {
  await service?.stop();
  await new Promise((r) => others?.close(r));
  await drop?.();
});

let kid1Token: string;

describe('asking a parent', () => {
  it('asks for consent when a child registers, with a link only the parent has', async () => {
    kid1Token = await consentLinkFor(ids.kid1);
    expect(kid1Token.length).toBeGreaterThanOrEqual(40);
    const events = await outboxEvents(dbUrl, 'consent.requested');
    expect(events).toHaveLength(1); // the adult and the demo account needed no one's permission
    expect(events[0]!.data).toMatchObject({
      userId: ids.kid1,
      parentEmail: 'parent1@example.com',
      childName: 'Kiran',
      locale: 'en',
    });
  });

  it('shows the parent what they are approving, and nobody else’s', async () => {
    const res = await call('GET', `/v1/consent/requests/${kid1Token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ childName: 'Kiran', status: 'pending' });
    expect(Object.keys(res.body).sort()).toEqual(['childName', 'requestedAt', 'status']);
    expect((await call('GET', '/v1/consent/requests/not-a-real-token')).status).toBe(404);
  });

  it('keeps only a hash of the token', async () => {
    const { rows } = await service.ctx.database.pool.query('SELECT token_hash FROM requests');
    expect(JSON.stringify(rows)).not.toContain(kid1Token);
  });
});

describe('the parent answers', () => {
  it('approving starts the child’s account, once', async () => {
    const res = await call('POST', '/v1/consent/respond', undefined, {
      token: kid1Token,
      decision: 'grant',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('granted');
    expect(
      (await outboxEvents(dbUrl, 'consent.granted')).map(
        (e) => (e.data as { userId: string }).userId,
      ),
    ).toEqual([ids.kid1]);
    const again = await call('POST', '/v1/consent/respond', undefined, {
      token: kid1Token,
      decision: 'deny',
    });
    expect(again.status).toBe(409);
    expect((await call('GET', `/v1/consent/requests/${kid1Token}`)).body.status).toBe('granted');
    expect(
      (
        await call('POST', '/v1/consent/respond', undefined, {
          token: 'nope-nope-nope',
          decision: 'grant',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call('POST', '/v1/consent/respond', undefined, {
          token: kid1Token,
          decision: 'maybe',
        })
      ).status,
    ).toBe(400);
  });

  it('declining erases the child everywhere, and the deletion can be followed', async () => {
    await register(ids.kid2, 'Dev', 'dev@example.com', 'parent2@example.com');
    const token2 = await consentLinkFor(ids.kid2);
    const res = await call('POST', '/v1/consent/respond', undefined, {
      token: token2,
      decision: 'deny',
    });
    expect(res.body.status).toBe('denied');
    expect(
      (await outboxEvents(dbUrl, 'consent.denied')).map(
        (e) => (e.data as { userId: string }).userId,
      ),
    ).toEqual([ids.kid2]);
    const asked = (await outboxEvents(dbUrl, 'privacy.deletion.requested')).find(
      (e) => (e.data as { userId: string }).userId === ids.kid2,
    )!;
    const requestId = (asked.data as { requestId: string }).requestId;

    const status = await call('GET', `/v1/privacy/deletions/${requestId}`);
    expect(status.body.status).toBe('pending');
    expect(status.body.services.map((s: { service: string }) => s.service).sort()).toEqual(
      [...PRIVACY_SERVICES, 'consent'].sort(),
    );
    expect(
      status.body.services.find((s: { service: string }) => s.service === 'consent').completedAt,
    ).not.toBeNull();
    expect(
      status.body.services.find((s: { service: string }) => s.service === 'media').completedAt,
    ).toBeNull();

    // the request itself is gone, so the link no longer leads anywhere
    expect((await call('GET', `/v1/consent/requests/${token2}`)).status).toBe(404);

    for (const service of PRIVACY_SERVICES) {
      await publish('privacy.deletion.completed', { requestId, userId: ids.kid2, service });
    }
    await eventually(
      async () =>
        (await call('GET', `/v1/privacy/deletions/${requestId}`)).body.status === 'completed',
    );
    expect((await call('GET', `/v1/privacy/deletions/${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe('a parent who never answers', () => {
  it('lets the request lapse after a week, and does not keep the child', async () => {
    await register(ids.kid3, 'Esha', 'esha@example.com', 'parent3@example.com');
    const token3 = await consentLinkFor(ids.kid3);
    await service.ctx.database.pool.query(
      "UPDATE requests SET requested_at = now() - interval '8 days' WHERE user_id = $1",
      [ids.kid3],
    );
    expect((await call('GET', `/v1/consent/requests/${token3}`)).body.status).toBe('expired');
    expect(
      (await call('POST', '/v1/consent/respond', undefined, { token: token3, decision: 'grant' }))
        .status,
    ).toBe(409);

    expect((await internal('/internal/consent/close-overdue')).closed).toBe(1);
    expect((await internal('/internal/consent/close-overdue')).closed).toBe(0);
    expect(
      (await outboxEvents(dbUrl, 'consent.denied')).some(
        (e) => (e.data as { userId: string }).userId === ids.kid3,
      ),
    ).toBe(true);
    expect(
      (await outboxEvents(dbUrl, 'privacy.deletion.requested')).some(
        (e) => (e.data as { userId: string }).userId === ids.kid3,
      ),
    ).toBe(true);
  });
});

describe('what admins see', () => {
  it('lists the requests with their status, for admins only', async () => {
    expect((await call('GET', '/v1/admin/consent', token.adult)).status).toBe(403);
    expect((await call('GET', '/v1/admin/consent')).status).toBe(401);
    const res = await call('GET', '/v1/admin/consent', token.admin);
    // Dev (declined) and Esha (lapsed) were erased with their requests; Kiran's stays as the record of consent
    expect(
      res.body.items.map(
        (i: { childName: string; status: string }) => `${i.childName}:${i.status}`,
      ),
    ).toEqual(['Kiran:granted']);
    expect(res.body.items[0]).toMatchObject({
      userId: ids.kid1,
      parentEmail: 'parent1@example.com',
    });
    expect(res.body.nextCursor).toBeNull();
  });
});

describe('my data', () => {
  it('collects everything every service holds about me, and says which part was unavailable', async () => {
    expect((await call('GET', '/v1/privacy/export')).status).toBe(401);
    const res = await call('GET', '/v1/privacy/export', token.adult);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(ids.adult);
    expect(Object.keys(res.body.services).sort()).toEqual([...PRIVACY_SERVICES, 'consent'].sort());
    expect(res.body.services.classroom).toEqual({ owner: ids.adult, from: 'classroom' });
    expect(res.body.services.profile).toEqual({ unavailable: true });
    expect(res.body.services.consent).toEqual([]);
  });

  it('deletes my account everywhere, and finishes when every service has said so', async () => {
    const res = await call('DELETE', '/v1/privacy/me', token.adult);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    const requestId = res.body.requestId as string;
    expect(
      (await outboxEvents(dbUrl, 'privacy.deletion.requested')).some(
        (e) => (e.data as { requestId: string }).requestId === requestId,
      ),
    ).toBe(true);
    for (const service of PRIVACY_SERVICES.slice(0, -1)) {
      await publish('privacy.deletion.completed', { requestId, userId: ids.adult, service });
    }
    await eventually(
      async () =>
        (await call('GET', `/v1/privacy/deletions/${requestId}`)).body.services.filter(
          (s: { completedAt: unknown }) => s.completedAt,
        ).length === PRIVACY_SERVICES.length,
    );
    expect((await call('GET', `/v1/privacy/deletions/${requestId}`)).body.status).toBe('pending');
    await publish('privacy.deletion.completed', {
      requestId,
      userId: ids.adult,
      service: PRIVACY_SERVICES.at(-1)!,
    });
    await eventually(
      async () =>
        (await call('GET', `/v1/privacy/deletions/${requestId}`)).body.status === 'completed',
    );
  });

  it('refuses to delete the shared demo accounts', async () => {
    const res = await call('DELETE', '/v1/privacy/me', token.demo);
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/demo/i);
    expect((await call('DELETE', '/v1/privacy/me')).status).toBe(401);
  });
});

describe('consent contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('consent'));
  });
});
