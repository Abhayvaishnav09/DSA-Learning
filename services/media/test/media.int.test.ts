import { randomBytes } from 'node:crypto';
import { routesOf } from '@logicpath/contracts';
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
import { makeEvent } from '@logicpath/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, mediaService, type MediaConfig } from '../src/service';

let service: RunningService<MediaConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let keys: Awaited<ReturnType<typeof testKeys>>;
const ids = { writer: crypto.randomUUID(), other: crypto.randomUUID(), admin: crypto.randomUUID() };
let tokens: Record<'writer' | 'other' | 'admin' | 'student', string>;

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('media'));
  prefix = testPrefix();
  keys = await testKeys();
  service = await startService(
    mediaService(
      loadConfig(
        env,
        baseTestEnv('media', dbUrl, prefix, {
          JWT_PUBLIC_JWK: keys.publicJwk,
          PUBLIC_API_URL: 'https://api.example.test',
          MAX_UPLOAD_MB: '1',
        }),
      ),
    ),
  );
  tokens = {
    writer: await keys.token(ids.writer, 'writer'),
    other: await keys.token(ids.other, 'writer'),
    admin: await keys.token(ids.admin, 'admin'),
    student: await keys.token(crypto.randomUUID(), 'student'),
  };
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#5546d6' } })
    .png()
    .toBuffer();

async function upload(
  token: string | undefined,
  file: { data: Buffer | string; type: string; name?: string } | null,
  alt?: string,
) {
  const form = new FormData();
  if (file)
    form.set(
      'file',
      new Blob([typeof file.data === 'string' ? file.data : new Uint8Array(file.data)], {
        type: file.type,
      }),
      file.name ?? 'pic.png',
    );
  if (alt !== undefined) form.set('alt', alt);
  const request = new Request('http://localhost/', { method: 'POST', body: form });
  const res = await service.app.inject({
    method: 'POST',
    url: '/v1/studio/media',
    payload: Buffer.from(await request.arrayBuffer()),
    headers: {
      'content-type': request.headers.get('content-type')!,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
}

const call = async (method: string, url: string, token?: string) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

let first: Record<string, any>;

describe('media', () => {
  it('turns an upload into three widths and a blur placeholder', async () => {
    const res = await upload(
      tokens.writer,
      { data: await png(1600, 900), type: 'image/png', name: 'hero.png' },
      'A purple banner',
    );
    expect(res.status).toBe(201);
    first = res.body;
    expect(first).toMatchObject({
      filename: 'hero.png',
      width: 1600,
      height: 900,
      alt: 'A purple banner',
      uploadedBy: ids.writer,
    });
    expect(first.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(first.urls).toEqual({
      w320: `https://api.example.test/media/${first.id}/w320`,
      w640: `https://api.example.test/media/${first.id}/w640`,
      w1280: `https://api.example.test/media/${first.id}/w1280`,
    });
    const created = await outboxEvents(dbUrl, 'media.asset.created');
    expect(created.at(-1)!.data).toMatchObject({ assetId: first.id, uploadedBy: ids.writer });
  });

  it('serves each width, cached for a year, to anyone', async () => {
    for (const [name, width] of [
      ['w320', 320],
      ['w640', 640],
      ['w1280', 1280],
    ] as const) {
      const res = await service.app.inject({ method: 'GET', url: `/media/${first.id}/${name}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/webp');
      expect(res.headers['cache-control']).toContain('immutable');
      const meta = await sharp(res.rawPayload).metadata();
      expect(meta).toMatchObject({ format: 'webp', width });
    }
    const withExtension = await service.app.inject({
      method: 'GET',
      url: `/media/${first.id}/w320.webp`,
    });
    expect(withExtension.statusCode).toBe(200);
    const etag = withExtension.headers.etag as string;
    const again = await service.app.inject({
      method: 'GET',
      url: `/media/${first.id}/w320`,
      headers: { 'if-none-match': etag },
    });
    expect(again.statusCode).toBe(304);
    expect(
      (await service.app.inject({ method: 'GET', url: `/media/${first.id}/w999` })).statusCode,
    ).toBe(404);
    expect(
      (await service.app.inject({ method: 'GET', url: `/media/${crypto.randomUUID()}/w320` }))
        .statusCode,
    ).toBe(404);
  });

  it('never makes a small picture bigger', async () => {
    const small = await upload(
      tokens.writer,
      { data: await png(200, 100), type: 'image/png' },
      'A small box',
    );
    expect(small.status).toBe(201);
    const big = await service.app.inject({ method: 'GET', url: `/media/${small.body.id}/w1280` });
    expect((await sharp(big.rawPayload).metadata()).width).toBe(200);
  });

  it('keeps pictures out of the hands of people who are not writers', async () => {
    const file = { data: await png(40, 40), type: 'image/png' };
    expect((await upload(undefined, file, 'A square')).status).toBe(401);
    expect((await upload(tokens.student, file, 'A square')).status).toBe(403);
    expect((await call('GET', '/v1/studio/media', tokens.student)).status).toBe(403);
  });

  it('refuses what is not a picture, is too big, or has no description', async () => {
    const good = { data: await png(40, 40), type: 'image/png' };
    expect((await upload(tokens.writer, null, 'Nothing here')).status).toBe(400);
    expect((await upload(tokens.writer, good, 'no')).status).toBe(400);
    expect((await upload(tokens.writer, good)).status).toBe(400);
    expect(
      (await upload(tokens.writer, { data: 'just words', type: 'image/png' }, 'Not a picture'))
        .status,
    ).toBe(400);
    const svg = await upload(
      tokens.writer,
      { data: '<svg xmlns="http://www.w3.org/2000/svg"/>', type: 'image/svg+xml', name: 'x.svg' },
      'A vector drawing',
    );
    expect([400, 415]).toContain(svg.status);
    const noise = randomBytes(1200 * 1200 * 3);
    const huge = await sharp(noise, { raw: { width: 1200, height: 1200, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(huge.length).toBeGreaterThan(1024 * 1024);
    const tooBig = await upload(tokens.writer, { data: huge, type: 'image/png' }, 'Far too large');
    expect(tooBig.status).toBe(413);
  }, 60_000);

  it('lists the library newest first, a page at a time', async () => {
    await upload(
      tokens.other,
      { data: await png(60, 60), type: 'image/png', name: 'third.png' },
      'Third picture',
    );
    const page = await call('GET', '/v1/studio/media?limit=2', tokens.writer);
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.items[0].filename).toBe('third.png');
    expect(page.body.nextCursor).toBeTruthy();
    const rest = await call(
      'GET',
      `/v1/studio/media?limit=2&cursor=${encodeURIComponent(page.body.nextCursor)}`,
      tokens.writer,
    );
    expect(rest.body.items).toHaveLength(1);
    expect(rest.body.nextCursor).toBeNull();
  });

  it('lets only the uploader or an admin delete a picture, and records it', async () => {
    expect((await call('DELETE', `/v1/studio/media/${first.id}`, tokens.other)).status).toBe(403);
    expect(
      (await call('DELETE', `/v1/studio/media/${crypto.randomUUID()}`, tokens.writer)).status,
    ).toBe(404);
    expect((await call('DELETE', `/v1/studio/media/${first.id}`, tokens.writer)).status).toBe(200);
    expect(
      (await service.app.inject({ method: 'GET', url: `/media/${first.id}/w320` })).statusCode,
    ).toBe(404);

    const mine = await upload(
      tokens.writer,
      { data: await png(50, 50), type: 'image/png' },
      'To be removed',
    );
    expect((await call('DELETE', `/v1/studio/media/${mine.body.id}`, tokens.admin)).status).toBe(
      200,
    );
    const actions = (await outboxEvents(dbUrl, 'audit.recorded')).map(
      (e) => (e.data as { action: string }).action,
    );
    expect(actions).toContain('media.deleted');
    expect(actions).toContain('media.uploaded');
    const gone = await outboxEvents(dbUrl, 'media.asset.deleted');
    expect(gone.map((e) => (e.data as { assetId: string }).assetId)).toContain(first.id);
  });

  it('keeps pictures but forgets who uploaded them when asked to forget a person', async () => {
    const other = await call('GET', '/v1/studio/media', tokens.writer);
    const mineBefore = other.body.items.filter(
      (a: { uploadedBy: string }) => a.uploadedBy === ids.other,
    );
    expect(mineBefore.length).toBeGreaterThan(0);
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'privacy.deletion.requested',
        { requestId: crypto.randomUUID(), userId: ids.other },
        'consent',
      ),
    );
    await bus.close();
    await eventually(
      async () => (await outboxEvents(dbUrl, 'privacy.deletion.completed')).length > 0,
    );
    const after = await call('GET', '/v1/studio/media', tokens.writer);
    expect(
      after.body.items.filter((a: { uploadedBy: string }) => a.uploadedBy === ids.other),
    ).toHaveLength(0);
    expect(after.body.items.length).toBe(other.body.items.length);
  });
});

describe('media contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('media'));
  });
});
