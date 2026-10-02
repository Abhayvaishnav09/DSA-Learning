import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentCache } from './content';

const log = pino({ level: 'silent' });
const bundle = (version: string) => ({ version, concepts: [], items: {}, lessons: {} });

/** A stand-in for the content service whose answers a test can change. */
function fakeContent() {
  const state = { number: 1, version: 'aaa', down: false, manifestCalls: 0, bundleCalls: 0 };
  const server: Server = createServer((req, res) => {
    if (state.down) {
      res.writeHead(503).end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/content/manifest') {
      state.manifestCalls += 1;
      res.end(JSON.stringify({ number: state.number, checksum: state.version }));
    } else if (req.url === '/v1/content/bundle') {
      state.bundleCalls += 1;
      res.end(JSON.stringify(bundle(state.version)));
    } else res.writeHead(404).end();
  });
  return new Promise<{ url: string; state: typeof state; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}`, state, close: () => server.close() });
    });
  });
}

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

describe('ContentCache', () => {
  it('fetches the curriculum once, however many callers ask at the same time', async () => {
    const content = await fakeContent();
    open.push(content.close);
    const cache = new ContentCache({ CONTENT_URL: content.url }, log);
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ number: 1, checksum: 'aaa' });
    await cache.get();
    expect(content.state.bundleCalls).toBe(1);
  });

  it('downloads the bundle again only when the version changed', async () => {
    const content = await fakeContent();
    open.push(content.close);
    const cache = new ContentCache({ CONTENT_URL: content.url }, log);
    await cache.get();
    await cache.refresh(); // same version: the manifest is enough
    expect(content.state.bundleCalls).toBe(1);
    content.state.number = 2;
    content.state.version = 'bbb';
    await cache.refresh();
    expect(await cache.get()).toMatchObject({ number: 2, checksum: 'bbb' });
    expect(content.state.bundleCalls).toBe(2);
  });

  it('keeps what it has when a refresh fails', async () => {
    const content = await fakeContent();
    open.push(content.close);
    const cache = new ContentCache({ CONTENT_URL: content.url }, log);
    await cache.get();
    content.state.down = true;
    await expect(cache.refresh()).rejects.toThrow(/503/);
    expect(await cache.get()).toMatchObject({ checksum: 'aaa' });
  });

  it('reads a bundle file instead when one is configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
    const path = join(dir, 'bundle.json');
    writeFileSync(path, JSON.stringify(bundle('from-file')));
    const cache = new ContentCache(
      { CONTENT_URL: 'http://unused.invalid', CONTENT_BUNDLE_PATH: path },
      log,
    );
    expect(await cache.get()).toMatchObject({ number: 1, checksum: 'from-file' });
  });
});
