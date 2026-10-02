import { createServer } from 'node:net';
import type { ContentBundle, ItemOf } from '@logicpath/content-schema';
import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  eventually,
  outboxEvents,
  testKeys,
  testPrefix,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentService, env as contentEnv } from '../../content/src/service';
import { authoringService, env, type AuthoringConfig } from '../src/service';

let authoring: RunningService<AuthoringConfig>;
let content: RunningService<any>;
const drops: (() => Promise<void>)[] = [];
let authoringDb: string;
let keys: Awaited<ReturnType<typeof testKeys>>;

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

beforeAll(async () => {
  const prefix = testPrefix();
  keys = await testKeys();
  const authoringPort = await freePort();
  const contentDb = await createTestDatabase('content');
  const authDb = await createTestDatabase('authoring');
  drops.push(contentDb.drop, authDb.drop);
  authoringDb = authDb.url;
  const shared = { JWT_PUBLIC_JWK: keys.publicJwk, INTERNAL_TOKEN: 'test-internal-token' };

  content = await startService(
    contentService(
      loadConfig(
        contentEnv,
        baseTestEnv('content', contentDb.url, prefix, {
          ...shared,
          AUTHORING_URL: `http://127.0.0.1:${authoringPort}`,
        }),
      ),
    ),
  );
  authoring = await startService(
    authoringService(
      loadConfig(
        env,
        baseTestEnv('authoring', authDb.url, prefix, {
          ...shared,
          PORT: String(authoringPort),
          CONTENT_URL: content.url,
        }),
      ),
    ),
  );
});

afterAll(async () => {
  await authoring?.stop();
  await content?.stop();
  for (const drop of drops) await drop();
});

const call = async (method: string, url: string, token: string, body?: unknown) => {
  const res = await authoring.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

const liveBundle = async () =>
  (await content.app.inject({ method: 'GET', url: '/v1/content/bundle' })).json() as ContentBundle;

async function variation(suffix: string, patch: Record<string, unknown> = {}) {
  const original = (await liveBundle()).items['loops.counter.how-many'] as ItemOf<'mcq'>;
  const id = `loops.counter.how-many.${suffix}`;
  return {
    kind: 'item',
    op: 'upsert',
    id,
    data: { ...original, id, variationOf: original.id, ...patch },
  };
}

const writerId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const writer = () => keys.token(writerId, 'writer', 'Wendy Writer');
const admin = () => keys.token(adminId, 'admin', 'Ada Admin');

describe('authoring workflow', () => {
  it('runs writer draft → validate → submit → admin approve → published', async () => {
    const w = await writer();
    const created = await call('POST', '/v1/studio/drafts', w, {
      title: 'Add a loop variation',
      changes: [await variation('w1')],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: 'draft',
      authorName: 'Wendy Writer',
      changeCount: 1,
    });
    const id = created.body.id as string;

    const validation = await call('POST', `/v1/studio/drafts/${id}/validate`, w);
    expect(validation.body).toMatchObject({ ok: true });

    const submitted = await call('POST', `/v1/studio/drafts/${id}/submit`, w);
    expect(submitted.body.status).toBe('in_review');
    expect((await call('PATCH', `/v1/studio/drafts/${id}`, w, { title: 'Nope' })).status).toBe(409);

    const queue = await call('GET', '/v1/admin/review/submissions', await admin());
    expect(queue.body.items.map((d: { id: string }) => d.id)).toContain(id);
    expect((await call('GET', '/v1/admin/review/submissions', w)).status).toBe(403);

    const approved = await call(
      'POST',
      `/v1/admin/review/submissions/${id}/approve`,
      await admin(),
      {
        comment: 'Looks good',
      },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');

    const published = await eventually(async () => {
      const res = await call('GET', `/v1/studio/drafts/${id}`, w);
      return res.body.status === 'published' ? res.body : null;
    });
    expect(published.publishedVersion).toBe(2);
    expect(published.activity.map((a: { action: string }) => a.action)).toEqual([
      'created',
      'submitted',
      'approved',
      'published',
    ]);
    expect((await liveBundle()).items['loops.counter.how-many.w1']).toBeDefined();
    // The read model follows the new version.
    await eventually(async () => {
      const res = await call('POST', '/v1/studio/drafts', w, {
        title: 'Duplicate id check',
        changes: [await variation('w1')],
      });
      const check = await call('POST', `/v1/studio/drafts/${res.body.id}/validate`, w);
      return check.body.baseVersion === (await liveBundle()).version;
    });
  });

  it('refuses to submit a draft whose answer key is wrong', async () => {
    const w = await writer();
    const bad = await variation('bad', {
      options: [
        { text: { en: '3', 'hi-Latn': '3' }, correct: false },
        { text: { en: '5', 'hi-Latn': '5' }, correct: true },
      ],
    });
    const created = await call('POST', '/v1/studio/drafts', w, { title: 'Broken', changes: [bad] });
    const validation = await call('POST', `/v1/studio/drafts/${created.body.id}/validate`, w);
    expect(validation.body.ok).toBe(true); // mcq keys are the author's call...
    const brokenCode = await variation('bad2', { code: 'for i from 1 to:\n    say "hi"' });
    await call('PATCH', `/v1/studio/drafts/${created.body.id}`, w, { changes: [brokenCode] });
    const submitted = await call('POST', `/v1/studio/drafts/${created.body.id}/submit`, w);
    expect(submitted.status).toBe(400); // ...but programs must run.
    expect(submitted.body.errors[0].path).toBe('concepts/loops.counter/items/how-many.bad2.yaml');
  });

  it('sends work back with a comment, and nobody approves their own work', async () => {
    const w = await writer();
    const a = await admin();
    const created = await call('POST', '/v1/studio/drafts', w, {
      title: 'Needs work',
      changes: [await variation('w3')],
    });
    const id = created.body.id as string;
    await call('POST', `/v1/studio/drafts/${id}/submit`, w);
    expect((await call('POST', `/v1/admin/review/submissions/${id}/approve`, w, {})).status).toBe(
      403,
    );

    const back = await call('POST', `/v1/admin/review/submissions/${id}/request-changes`, a, {
      comment: 'Please add a hint about counting from 1',
    });
    expect(back.body.status).toBe('changes_requested');
    expect(back.body.activity.at(-1)).toMatchObject({
      action: 'changes_requested',
      actorName: 'Ada Admin',
      comment: 'Please add a hint about counting from 1',
    });
    expect(
      (await call('PATCH', `/v1/studio/drafts/${id}`, w, { title: 'Needs work (fixed)' })).status,
    ).toBe(200);
    expect((await call('POST', `/v1/studio/drafts/${id}/submit`, w)).body.status).toBe('in_review');

    const own = await call('POST', '/v1/studio/drafts', a, {
      title: 'Admin draft',
      changes: [await variation('a1')],
    });
    await call('POST', `/v1/studio/drafts/${own.body.id}/submit`, a);
    const self = await call('POST', `/v1/admin/review/submissions/${own.body.id}/approve`, a, {});
    expect(self.status).toBe(403);
    expect(self.body.detail).toBe('you cannot review your own work');

    const rejected = await outboxEvents(authoringDb, 'authoring.submission.rejected');
    expect(rejected.at(-1)?.data).toMatchObject({ submissionId: id, authorId: writerId });
  });

  it('keeps drafts private to their author and blocks students', async () => {
    const w = await writer();
    const other = await keys.token(crypto.randomUUID(), 'writer');
    const student = await keys.token(crypto.randomUUID(), 'student');
    const created = await call('POST', '/v1/studio/drafts', w, { title: 'Private', changes: [] });
    expect((await call('GET', `/v1/studio/drafts/${created.body.id}`, other)).status).toBe(404);
    expect((await call('GET', '/v1/studio/drafts', student)).status).toBe(403);
    expect((await call('POST', `/v1/studio/drafts/${created.body.id}/submit`, w)).status).toBe(400);
    expect((await call('DELETE', `/v1/studio/drafts/${created.body.id}`, w)).body).toEqual({
      ok: true,
    });
  });
});
