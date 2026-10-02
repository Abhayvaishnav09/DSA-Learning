import bundleJson from '@logicpath/content/bundle.json';
import { createClient, memoryTokenStore, type ApiError } from '@logicpath/api-client';
import { localTransport } from '@logicpath/api-client/local';
import type { ContentBundle, ItemOf } from '@logicpath/content-schema';
import { describe, expect, it } from 'vitest';
import { createLocalBackend, DEMO_ACCOUNTS, DEMO_PASSWORD, memoryStorage } from './index';

const seed = bundleJson as unknown as ContentBundle;

async function setup(storage = memoryStorage()) {
  const backend = createLocalBackend({ seed, storage });
  await backend.ready;
  const session = (role: 'student' | 'writer' | 'admin') => {
    const api = createClient(
      localTransport({ backend, tokens: memoryTokenStore(), validateResponses: true }),
    );
    const account = DEMO_ACCOUNTS.find((a) => a.role === role)!;
    return {
      api,
      login: () =>
        api.call('auth.login', { body: { email: account.email, password: DEMO_PASSWORD } }),
    };
  };
  return { backend, storage, session };
}

const variation = (bundle: ContentBundle, suffix: string, patch: Record<string, unknown> = {}) => {
  const original = bundle.items['loops.counter.how-many'] as ItemOf<'mcq'>;
  const id = `loops.counter.how-many.${suffix}`;
  return {
    kind: 'item' as const,
    op: 'upsert' as const,
    id,
    data: { ...original, id, variationOf: original.id, ...patch },
  };
};

describe('local backend', () => {
  it('signs in the demo accounts and keeps data across reloads', async () => {
    const { session, storage } = await setup();
    const student = session('student');
    const { user } = await student.login();
    expect(user.role).toBe('student');
    await student.api.call('profile.update', { body: { dailyGoalMinutes: 20 } });
    await Promise.resolve();

    // A new backend on the same storage (a page reload) sees the same data.
    const again = await setup(storage);
    const reloaded = again.session('student');
    await reloaded.login();
    expect((await reloaded.api.call('profile.get')).dailyGoalMinutes).toBe(20);
  });

  it('registers adults straight away and holds minors for parental consent', async () => {
    const { session } = await setup();
    const { api } = session('student');
    const year = new Date().getUTCFullYear();
    const adult = await api.call('auth.register', {
      body: { email: 'new@x.co', password: 'password-1', name: 'New', birthYear: year - 20 },
    });
    expect(adult.status).toBe('active');
    const missing = (await api
      .call('auth.register', {
        body: { email: 'kid@x.co', password: 'password-1', name: 'Kid', birthYear: year - 12 },
      })
      .catch((e: unknown) => e)) as ApiError;
    expect(missing.fieldErrors()).toEqual({ parentEmail: 'required for learners under 18' });
    const minor = await api.call('auth.register', {
      body: {
        email: 'kid@x.co',
        password: 'password-1',
        name: 'Kid',
        birthYear: year - 12,
        parentEmail: 'mum@x.co',
      },
    });
    expect(minor.status).toBe('pending_consent');
    await expect(
      api.call('auth.login', { body: { email: 'kid@x.co', password: 'password-1' } }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it('runs the writer → admin publish flow like the services', async () => {
    const { session } = await setup();
    const writer = session('writer');
    const admin = session('admin');
    await writer.login();
    await admin.login();
    const before = await writer.api.call('content.bundle');

    const draft = await writer.api.call('studio.drafts.create', {
      body: { title: 'New variation', changes: [variation(before, 'demo1')] },
    });
    expect((await writer.api.call('studio.drafts.validate', { params: { id: draft.id } })).ok).toBe(
      true,
    );
    await writer.api.call('studio.drafts.submit', { params: { id: draft.id } });
    expect((await admin.api.call('admin.review.list')).items.map((d) => d.id)).toContain(draft.id);
    await expect(writer.api.call('admin.review.list')).rejects.toMatchObject({ status: 403 });

    const approved = await admin.api.call('admin.review.approve', {
      params: { id: draft.id },
      body: {},
    });
    expect(approved.status).toBe('published');
    expect(approved.activity.map((a) => a.action)).toEqual([
      'created',
      'submitted',
      'approved',
      'published',
    ]);
    const after = await writer.api.call('content.bundle');
    expect(after.items['loops.counter.how-many.demo1']).toBeDefined();
    expect((await writer.api.call('content.manifest')).number).toBe(2);

    // Roll back to version 1: the new item disappears, history keeps both.
    const versions = await admin.api.call('admin.content.versions');
    const first = versions.items.find((v) => v.number === 1)!;
    await admin.api.call('admin.content.rollback', { params: { id: first.id }, body: {} });
    expect(
      (await writer.api.call('content.bundle')).items['loops.counter.how-many.demo1'],
    ).toBeUndefined();
  });

  it('refuses broken drafts and enforces the workflow', async () => {
    const { session } = await setup();
    const writer = session('writer');
    const admin = session('admin');
    await writer.login();
    await admin.login();
    const bundle = await writer.api.call('content.bundle');
    const draft = await writer.api.call('studio.drafts.create', {
      body: {
        title: 'Broken',
        changes: [variation(bundle, 'bad', { code: 'for i from 1 to:\n    say 1' })],
      },
    });
    const submit = (await writer.api
      .call('studio.drafts.submit', { params: { id: draft.id } })
      .catch((e: unknown) => e)) as ApiError;
    expect(submit.status).toBe(400);
    await expect(
      admin.api.call('admin.review.approve', { params: { id: draft.id }, body: {} }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it('lets admins manage users with an audit trail', async () => {
    const { session, backend } = await setup();
    const admin = session('admin');
    const { user } = await admin.login();
    const created = await admin.api.call('admin.users.create', {
      body: { email: 'w2@x.co', name: 'Second Writer', role: 'writer', password: 'password-1' },
    });
    const search = await admin.api.call('admin.users.list', { query: { q: 'second' } });
    expect(search.items.map((u) => u.id)).toEqual([created.id]);
    await admin.api.call('admin.users.update', {
      params: { id: created.id },
      body: { status: 'suspended' },
    });
    await expect(
      admin.api.call('admin.users.update', { params: { id: user.id }, body: { role: 'student' } }),
    ).rejects.toMatchObject({ status: 403 });
    expect(backend.db.t.audit.map((a) => a.action)).toEqual(['user.updated', 'user.created']);
  });
});
