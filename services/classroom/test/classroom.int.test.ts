import { makeEvent, routesOf, type EventData, type EventType } from '@logicpath/contracts';
import { istDate, weekStart } from '@logicpath/gamification-rules';
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
import { classroomService, env, type ClassroomConfig } from '../src/service';

let service: RunningService<ClassroomConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
const ids = {
  admin: crypto.randomUUID(),
  teacher: crypto.randomUUID(),
  asha: crypto.randomUUID(),
  ravi: crypto.randomUUID(),
  outsider: crypto.randomUUID(),
};
let tokens: Record<keyof typeof ids, string>;

async function publish<T extends EventType>(type: T, data: EventData<T>) {
  const bus = await testBus(prefix);
  await bus.publish(makeEvent(type, data, 'test'));
  await bus.close();
}

const registered = (userId: string, name: string, role: 'student' | 'writer' | 'admin') =>
  publish('identity.user.registered', {
    userId,
    email: `${userId}@example.com`,
    name,
    role,
    locale: 'en',
    birthYear: 1990,
    minor: false,
    parentEmail: null,
    status: 'active',
  });

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('classroom'));
  prefix = testPrefix();
  const keys = await testKeys();
  service = await startService(
    classroomService(
      loadConfig(env, baseTestEnv('classroom', dbUrl, prefix, { JWT_PUBLIC_JWK: keys.publicJwk })),
    ),
  );
  tokens = {
    admin: await keys.token(ids.admin, 'admin', 'Anita Admin'),
    teacher: await keys.token(ids.teacher, 'writer', 'Wasim Writer'),
    asha: await keys.token(ids.asha, 'student', 'Asha'),
    ravi: await keys.token(ids.ravi, 'student', 'Ravi'),
    outsider: await keys.token(ids.outsider, 'student', 'Olive'),
  };
  await registered(ids.admin, 'Anita Admin', 'admin');
  await registered(ids.teacher, 'Wasim Writer', 'writer');
  await registered(ids.asha, 'Asha Verma', 'student');
  await registered(ids.ravi, 'Ravi Kumar', 'student');
  await eventually(
    async () =>
      (
        await call('POST', '/v1/admin/classes', tokens.admin, {
          name: 'Probe class',
          ownerId: ids.teacher,
        })
      ).status === 201,
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

let klass: Record<string, any>;

describe('creating classes', () => {
  it('lets an admin create a class for a teacher, with a code that is easy to read out', async () => {
    const res = await call('POST', '/v1/admin/classes', tokens.admin, {
      name: '  Grade 8 — Logic  ',
      ownerId: ids.teacher,
    });
    expect(res.status).toBe(201);
    klass = res.body;
    expect(klass).toMatchObject({
      name: 'Grade 8 — Logic',
      ownerId: ids.teacher,
      ownerName: 'Wasim Writer',
      memberCount: 0,
    });
    expect(klass.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('is for admins only, and the owner must be a writer or an admin', async () => {
    expect((await call('POST', '/v1/admin/classes', tokens.teacher, { name: 'Mine' })).status).toBe(
      403,
    );
    expect((await call('POST', '/v1/admin/classes', undefined, { name: 'Mine' })).status).toBe(401);
    const forStudent = await call('POST', '/v1/admin/classes', tokens.admin, {
      name: 'Mine',
      ownerId: ids.asha,
    });
    expect(forStudent.status).toBe(409);
    const forMe = await call('POST', '/v1/admin/classes', tokens.admin, {
      name: 'Admin’s own class',
    });
    expect(forMe.status).toBe(201);
    expect(forMe.body.ownerId).toBe(ids.admin);
    expect((await call('POST', '/v1/admin/classes', tokens.admin, { name: 'x' })).status).toBe(400);
  });
});

describe('joining', () => {
  it('lets a learner join with the code, in any case, once', async () => {
    const res = await call('POST', '/v1/classes/join', tokens.asha, {
      code: ` ${klass.code.toLowerCase()} `,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: klass.id, name: klass.name, code: null, memberCount: 1 });
    await call('POST', '/v1/classes/join', tokens.asha, { code: klass.code });
    const joined = (await outboxEvents(dbUrl, 'classroom.member.joined')).filter(
      (e) => (e.data as { userId: string }).userId === ids.asha,
    );
    expect(joined).toHaveLength(1);
    expect(joined[0]!.data).toMatchObject({
      classId: klass.id,
      ownerId: ids.teacher,
      className: klass.name,
    });
    await call('POST', '/v1/classes/join', tokens.ravi, { code: klass.code });
  });

  it('refuses a wrong code, the teacher joining their own class, and signed-out visitors', async () => {
    expect((await call('POST', '/v1/classes/join', tokens.asha, { code: 'ZZZZZZ' })).status).toBe(
      404,
    );
    expect(
      (await call('POST', '/v1/classes/join', tokens.teacher, { code: klass.code })).status,
    ).toBe(409);
    expect((await call('POST', '/v1/classes/join', undefined, { code: klass.code })).status).toBe(
      401,
    );
    expect((await call('POST', '/v1/classes/join', tokens.asha, { code: 'abc' })).status).toBe(400);
  });

  it('shows each person their own classes, and the code only to those who run it', async () => {
    const asha = await call('GET', '/v1/classes', tokens.asha);
    expect(asha.body.items.map((c: { id: string }) => c.id)).toEqual([klass.id]);
    expect(asha.body.items[0].code).toBeNull();
    const teacher = await call('GET', '/v1/classes', tokens.teacher);
    expect(
      teacher.body.items.some(
        (c: { id: string; code: string }) => c.id === klass.id && c.code === klass.code,
      ),
    ).toBe(true);
    expect((await call('GET', '/v1/classes', tokens.outsider)).body.items).toEqual([]);
    // an admin sees the code of any class they open
    expect((await call('GET', `/v1/classes/${klass.id}`, tokens.admin)).body.code).toBe(klass.code);
  });
});

describe('the roster', () => {
  it('shows a teacher how each learner is doing, from what the other services announce', async () => {
    const week = weekStart(istDate(new Date()));
    const today = istDate(new Date());
    await publish('progress.concept.mastered', {
      userId: ids.asha,
      conceptId: 'loops.counter',
      at: new Date().toISOString(),
    });
    await publish('progress.streak.updated', {
      userId: ids.asha,
      current: 3,
      longest: 3,
      localDate: today,
    });
    await publish('gamification.xp.awarded', {
      userId: ids.asha,
      amount: 40,
      reason: 'attempt',
      weekStart: week,
      at: new Date().toISOString(),
    });
    await publish('gamification.xp.awarded', {
      userId: ids.asha,
      amount: 15,
      reason: 'daily-goal',
      weekStart: week,
      at: new Date().toISOString(),
    });
    await publish('gamification.xp.awarded', {
      userId: ids.ravi,
      amount: 20,
      reason: 'attempt',
      weekStart: week,
      at: new Date().toISOString(),
    });
    // an older week must not count
    await publish('gamification.xp.awarded', {
      userId: ids.ravi,
      amount: 999,
      reason: 'attempt',
      weekStart: '2020-01-06',
      at: new Date().toISOString(),
    });
    await eventually(async () => {
      const res = await call('GET', `/v1/classes/${klass.id}`, tokens.teacher);
      return (
        res.body.members?.[0]?.xpThisWeek === 55 &&
        res.body.members?.[0]?.conceptsMastered === 1 &&
        res.body.members?.[1]?.xpThisWeek === 20
      );
    });
    const res = await call('GET', `/v1/classes/${klass.id}`, tokens.teacher);
    expect(res.body.code).toBe(klass.code);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual([
      'Asha Verma',
      'Ravi Kumar',
    ]);
    expect(res.body.members[0]).toMatchObject({
      userId: ids.asha,
      xpThisWeek: 55,
      conceptsMastered: 1,
      lastActiveOn: today,
    });
    expect(res.body.members[1]).toMatchObject({
      userId: ids.ravi,
      xpThisWeek: 20,
      conceptsMastered: 0,
      lastActiveOn: null,
    });
  });

  it('hides the roster from members and the whole class from outsiders', async () => {
    const asMember = await call('GET', `/v1/classes/${klass.id}`, tokens.ravi);
    expect(asMember.status).toBe(200);
    expect(asMember.body.members).toEqual([]);
    expect(asMember.body.code).toBeNull();
    expect((await call('GET', `/v1/classes/${klass.id}`, tokens.outsider)).status).toBe(404);
    expect((await call('GET', `/v1/classes/${crypto.randomUUID()}`, tokens.teacher)).status).toBe(
      404,
    );
    expect((await call('GET', `/v1/classes/${klass.id}`, tokens.admin)).body.members).toHaveLength(
      2,
    );
  });

  it('follows a renamed learner', async () => {
    await publish('profile.updated', {
      userId: ids.ravi,
      displayName: 'Ravi K.',
      locale: 'en',
      timeZone: 'Asia/Kolkata',
      dailyGoalMinutes: 10,
    });
    await eventually(async () =>
      (await call('GET', `/v1/classes/${klass.id}`, tokens.teacher)).body.members.some(
        (m: { name: string }) => m.name === 'Ravi K.',
      ),
    );
  });
});

describe('leaving and managing', () => {
  it('lets a learner leave, once', async () => {
    expect((await call('DELETE', `/v1/classes/${klass.id}/membership`, tokens.ravi)).status).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/classes/${klass.id}/membership`, tokens.ravi)).status).toBe(
      404,
    );
    expect((await call('GET', `/v1/classes/${klass.id}`, tokens.teacher)).body.memberCount).toBe(1);
  });

  it('lists classes for admins a page at a time', async () => {
    expect((await call('GET', '/v1/admin/classes', tokens.teacher)).status).toBe(403);
    const first = await call('GET', '/v1/admin/classes?limit=2', tokens.admin);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const rest = await call(
      'GET',
      `/v1/admin/classes?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      tokens.admin,
    );
    const all = [...first.body.items, ...rest.body.items].map((c: { id: string }) => c.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it('replaces a code, so the old one stops working', async () => {
    const res = await call('POST', `/v1/admin/classes/${klass.id}/code`, tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe(klass.code);
    expect((await call('POST', '/v1/classes/join', tokens.ravi, { code: klass.code })).status).toBe(
      404,
    );
    expect(
      (await call('POST', '/v1/classes/join', tokens.ravi, { code: res.body.code })).status,
    ).toBe(200);
    expect(
      (await call('POST', `/v1/admin/classes/${crypto.randomUUID()}/code`, tokens.admin)).status,
    ).toBe(404);
    klass = res.body;
  });

  it('deletes a class with its roster, and records what admins did', async () => {
    expect((await call('DELETE', `/v1/admin/classes/${klass.id}`, tokens.teacher)).status).toBe(
      403,
    );
    expect((await call('DELETE', `/v1/admin/classes/${klass.id}`, tokens.admin)).status).toBe(200);
    expect((await call('GET', `/v1/classes/${klass.id}`, tokens.asha)).status).toBe(404);
    expect((await call('GET', '/v1/classes', tokens.asha)).body.items).toEqual([]);
    expect((await call('DELETE', `/v1/admin/classes/${klass.id}`, tokens.admin)).status).toBe(404);
    const actions = (await outboxEvents(dbUrl, 'audit.recorded')).map(
      (e) => (e.data as { action: string }).action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['class.created', 'class.code_replaced', 'class.deleted']),
    );
  });
});

describe('privacy', () => {
  it('forgets a learner’s memberships and a teacher’s classes', async () => {
    const mine = await call('POST', '/v1/admin/classes', tokens.admin, {
      name: 'To be forgotten',
      ownerId: ids.teacher,
    });
    await call('POST', '/v1/classes/join', tokens.asha, { code: mine.body.code });
    const exported = await service.app.inject({
      method: 'GET',
      url: `/internal/users/${ids.asha}/export`,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    });
    expect(exported.json().data.joined).toHaveLength(1);

    await publish('privacy.deletion.requested', {
      requestId: crypto.randomUUID(),
      userId: ids.asha,
    });
    await eventually(
      async () => (await call('GET', '/v1/classes', tokens.asha)).body.items.length === 0,
    );
    await publish('privacy.deletion.requested', {
      requestId: crypto.randomUUID(),
      userId: ids.teacher,
    });
    await eventually(
      async () => (await outboxEvents(dbUrl, 'privacy.deletion.completed')).length >= 2,
    );
    expect(
      (await call('GET', '/v1/admin/classes?limit=100', tokens.admin)).body.items.some(
        (c: { ownerId: string }) => c.ownerId === ids.teacher,
      ),
    ).toBe(false);
    expect(
      (await outboxEvents(dbUrl, 'privacy.deletion.completed')).every(
        (e) => (e.data as { service: string }).service === 'classroom',
      ),
    ).toBe(true);
  });
});

describe('classroom contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('classroom'));
  });
});
