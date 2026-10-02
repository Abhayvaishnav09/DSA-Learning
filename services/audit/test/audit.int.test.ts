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
import { auditService, env, type AuditConfig } from '../src/service';

let service: RunningService<AuditConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;
let admin: string;
let student: string;
const adminId = crypto.randomUUID();
const writerId = crypto.randomUUID();

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('audit'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    auditService(
      loadConfig(env, baseTestEnv('audit', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk })),
    ),
  );
  admin = await keys.token(adminId, 'admin');
  student = await keys.token(crypto.randomUUID(), 'student');
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const get = async (url: string, token?: string) => {
  const res = await service.app.inject({
    method: 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

async function record(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  at: string,
  details: Record<string, unknown> = {},
) {
  const bus = await testBus(prefix);
  await bus.publish(
    makeEvent(
      'audit.recorded',
      {
        actorId,
        actorRole: actorId === adminId ? 'admin' : actorId ? 'writer' : null,
        action,
        targetType,
        targetId,
        details,
        at,
      },
      'identity',
    ),
  );
  await bus.close();
}

describe('audit', () => {
  it('keeps what services announce and lists it newest first, for admins only', async () => {
    await record(adminId, 'flag.updated', 'flag', 'map.3d', '2026-10-01T10:00:00.000Z', {
      enabled: false,
    });
    await record(writerId, 'media.uploaded', 'media', 'm1', '2026-10-01T11:00:00.000Z');
    await record(adminId, 'user.updated', 'user', 'u1', '2026-10-01T12:00:00.000Z');
    await eventually(async () => (await get('/v1/admin/audit', admin)).body.items?.length === 3);

    const all = await get('/v1/admin/audit', admin);
    expect(all.body.items.map((e: { action: string }) => e.action)).toEqual([
      'user.updated',
      'media.uploaded',
      'flag.updated',
    ]);
    expect(all.body.items[2]).toMatchObject({
      actorId: adminId,
      actorRole: 'admin',
      targetType: 'flag',
      targetId: 'map.3d',
      details: { enabled: false },
      at: '2026-10-01T10:00:00.000Z',
    });
    expect(all.body.nextCursor).toBeNull();

    expect((await get('/v1/admin/audit')).status).toBe(401);
    expect((await get('/v1/admin/audit', student)).status).toBe(403);
  });

  it('filters by who, what and on what', async () => {
    const byAdmin = await get(`/v1/admin/audit?actorId=${adminId}`, admin);
    expect(byAdmin.body.items).toHaveLength(2);
    const byAction = await get('/v1/admin/audit?action=media.uploaded', admin);
    expect(byAction.body.items.map((e: { targetId: string }) => e.targetId)).toEqual(['m1']);
    const byTarget = await get('/v1/admin/audit?targetType=flag', admin);
    expect(byTarget.body.items).toHaveLength(1);
  });

  it('pages through the trail with a cursor, without repeating or skipping', async () => {
    const first = await get('/v1/admin/audit?limit=2', admin);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await get(
      `/v1/admin/audit?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      admin,
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect((await get('/v1/admin/audit?cursor=%%%', admin)).status).toBe(400);
  });

  it('stops pointing at a person who asks to be forgotten, but keeps what was done', async () => {
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'privacy.deletion.requested',
        { requestId: crypto.randomUUID(), userId: writerId },
        'consent',
      ),
    );
    await bus.close();
    await eventually(
      async () => (await outboxEvents(dbUrl, 'privacy.deletion.completed')).length > 0,
    );
    const rows = (await get('/v1/admin/audit?action=media.uploaded', admin)).body.items;
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeNull();
    const done = await outboxEvents(dbUrl, 'privacy.deletion.completed');
    expect(done[0]!.data).toMatchObject({ userId: writerId, service: 'audit' });
  });

  it('hands over a person’s own actions for the privacy export', async () => {
    const res = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${adminId}/export`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.actions).toHaveLength(2);
    const denied = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${adminId}/export`,
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe('audit contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('audit'));
  });
});
