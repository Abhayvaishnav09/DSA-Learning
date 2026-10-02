import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ContentBundle } from '@logicpath/content-schema';
import { makeEvent, pub, routesOf } from '@logicpath/contracts';
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
import { contentService, env, type ContentConfig } from '../src/service';

let service: RunningService<ContentConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;
let fakeAuthoring: Server;
const submissions = new Map<string, unknown>();

beforeAll(async () => {
  // Stands in for the authoring service's claim-check endpoint.
  fakeAuthoring = createServer((req, res) => {
    const id = req.url?.split('/').at(-1) ?? '';
    const ok = req.headers['x-internal-token'] === 'test-internal-token' && submissions.has(id);
    res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ok ? submissions.get(id) : {}));
  });
  await new Promise<void>((resolve) => fakeAuthoring.listen(0, '127.0.0.1', resolve));
  const port = (fakeAuthoring.address() as AddressInfo).port;

  ({ url: dbUrl, drop } = await createTestDatabase('content'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    contentService(
      loadConfig(
        env,
        baseTestEnv('content', dbUrl, prefix, {
          JWT_PUBLIC_JWK: keys.publicJwk,
          INTERNAL_TOKEN: 'test-internal-token',
          AUTHORING_URL: `http://127.0.0.1:${port}`,
        }),
      ),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
  fakeAuthoring?.close();
});

const call = async (
  method: string,
  url: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body ? (res.json() as Record<string, any>) : null,
  };
};

const bundle = async () => (await call('GET', '/v1/content/bundle')).body as ContentBundle;

async function approve(changes: unknown[]) {
  const submissionId = crypto.randomUUID();
  submissions.set(submissionId, {
    id: submissionId,
    title: 'Test change',
    authorId: crypto.randomUUID(),
    changes,
  });
  const bus = await testBus(prefix);
  await bus.publish(
    makeEvent(
      'authoring.submission.approved',
      {
        submissionId,
        authorId: crypto.randomUUID(),
        reviewerId: crypto.randomUUID(),
        title: 'Test change',
      },
      'authoring',
    ),
  );
  await bus.close();
  return submissionId;
}

describe('content', () => {
  it('imports the seed curriculum as version 1 with precomputed visuals', async () => {
    const res = await call('GET', '/v1/content/bundle');
    expect(res.status).toBe(200);
    const body = res.body as ContentBundle;
    expect(body.lessons['loops.counter']).toBeDefined();
    const visual = body.visuals!['loops.counter']!;
    expect(visual.frames.length).toBeGreaterThan(3);
    expect(visual.captions['hi-Latn']).toHaveLength(visual.frames.length);

    const again = await call('GET', '/v1/content/bundle', undefined, undefined, {
      'if-none-match': res.headers.etag as string,
    });
    expect(again.status).toBe(304);

    const manifest = await call('GET', '/v1/content/manifest');
    expect(manifest.body).toMatchObject({ number: 1, checksum: body.version, concepts: 1 });
  });

  it('publishes an approved submission as a new version', async () => {
    const before = await bundle();
    const original = before.items['loops.counter.how-many']!;
    const submissionId = await approve([
      {
        kind: 'item',
        op: 'upsert',
        id: 'loops.counter.how-many.v3',
        data: { ...original, id: 'loops.counter.how-many.v3', variationOf: original.id },
      },
    ]);
    const published = await eventually(async () =>
      (await outboxEvents(dbUrl, 'content.version.published')).find(
        (e) => (e.data as { submissionId: string | null }).submissionId === submissionId,
      ),
    );
    expect(published.data).toMatchObject({ number: 2 });
    const after = await bundle();
    expect(after.items['loops.counter.how-many.v3']).toBeDefined();
    expect(after.version).not.toBe(before.version);
  });

  it('refuses a submission that breaks the curriculum and says why', async () => {
    const before = await bundle();
    const original = before.items['loops.counter.predict-last']!;
    const submissionId = await approve([
      { kind: 'item', op: 'upsert', id: original.id, data: { ...original, answer: '999' } },
    ]);
    const failed = await eventually(async () =>
      (await outboxEvents(dbUrl, 'content.publish.failed')).find(
        (e) => (e.data as { submissionId: string }).submissionId === submissionId,
      ),
    );
    expect(JSON.stringify(failed.data)).toContain('999');
    expect((await bundle()).version).toBe(before.version);
  });

  it('lets only admins list and restore versions', async () => {
    const student = await keys.token(crypto.randomUUID(), 'student');
    const admin = await keys.token(crypto.randomUUID(), 'admin');
    expect((await call('GET', '/v1/admin/content/versions', student)).status).toBe(403);

    const list = await call('GET', '/v1/admin/content/versions?limit=1', admin);
    expect(list.body!.items).toHaveLength(1);
    expect(list.body!.items[0]).toMatchObject({ number: 2, current: true });
    const next = await call(
      'GET',
      `/v1/admin/content/versions?cursor=${list.body!.nextCursor}`,
      admin,
    );
    const first = next.body!.items.find((v: { number: number }) => v.number === 1);

    const restored = await call(
      'POST',
      `/v1/admin/content/versions/${first.id}/rollback`,
      admin,
      {},
    );
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ number: 3, note: 'Restored version 1', current: true });
    expect((await bundle()).items['loops.counter.how-many.v3']).toBeUndefined();
    expect((await outboxEvents(dbUrl, 'audit.recorded')).at(-1)?.data).toMatchObject({
      action: 'content.rollback',
    });
  });
});

describe('the public API for outside developers', () => {
  const get = async (url: string) => {
    const res = await service.app.inject({ method: 'GET', url });
    return { status: res.statusCode, body: res.json() as Record<string, any> };
  };

  it('lists stages and concepts', async () => {
    const res = await get('/public/v1/curriculum');
    expect(res.status).toBe(200);
    expect(pub.PublicCurriculum.safeParse(res.body).success).toBe(true);
    expect(res.body.stages.length).toBeGreaterThan(0);
    const counter = res.body.concepts.find((c: { id: string }) => c.id === 'loops.counter');
    expect(counter).toMatchObject({ published: true, title: { en: 'Loops with a counter' } });
    expect(res.body.concepts.some((c: { published: boolean }) => !c.published)).toBe(true);
  });

  it('shows a concept with its lesson, and says so when there is none', async () => {
    const res = await get('/public/v1/concepts/loops.counter');
    expect(res.status).toBe(200);
    expect(pub.PublicLesson.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      concept: { id: 'loops.counter' },
      itemCount: expect.any(Number),
    });
    expect(res.body.itemCount).toBeGreaterThan(3);
    expect(res.body.code.length).toBeGreaterThan(10);
    expect((await get('/public/v1/concepts/no.such')).status).toBe(404);
    // a concept still being written has no lesson to show
    const unwritten = (await get('/public/v1/curriculum')).body.concepts.find(
      (c: { published: boolean }) => !c.published,
    );
    expect((await get(`/public/v1/concepts/${unwritten.id}`)).status).toBe(404);
  });

  it('lists a concept’s questions without ever giving away the answers', async () => {
    const res = await get('/public/v1/items?concept=loops.counter');
    expect(res.status).toBe(200);
    expect(pub.PublicItemList.safeParse(res.body).success).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(3);
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      conceptId: 'loops.counter',
      type: expect.any(String),
      difficulty: expect.any(Number),
      prompt: { en: expect.any(String), 'hi-Latn': expect.any(String) },
      code: expect.toSatisfy((c: unknown) => c === null || typeof c === 'string'),
    });
    const text = JSON.stringify(res.body);
    for (const secret of [
      '"answer"',
      '"correct"',
      '"explanation"',
      '"hints"',
      '"options"',
      '"blanks"',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect((await get('/public/v1/items?concept=no.such')).status).toBe(404);
    expect((await get('/public/v1/items')).status).toBe(400);
  });
});

describe('content contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('content'));
  });
});
