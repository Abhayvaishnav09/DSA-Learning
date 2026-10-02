import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEvent, routesOf } from '@logicpath/contracts';
import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  documentedRoutes,
  eventually,
  testBus,
  testPrefix,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, searchService, type SearchConfig } from '../src/service';

let service: RunningService<SearchConfig>;
let drop: () => Promise<void>;
let prefix: string;
let bundleFile: string;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-'));
  bundleFile = join(dir, 'bundle.json');
  copyFileSync(
    createRequire(import.meta.url).resolve('@logicpath/content/bundle.json'),
    bundleFile,
  );
  const db = await createTestDatabase('search');
  drop = db.drop;
  prefix = testPrefix();
  service = await startService(
    searchService(
      loadConfig(env, baseTestEnv('search', db.url, prefix, { CONTENT_BUNDLE_PATH: bundleFile })),
    ),
  );
});

afterAll(async () => {
  await service?.stop();
  await drop?.();
});

const search = async (query: string) => {
  const res = await service.app.inject({ method: 'GET', url: `/v1/search?${query}` });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};

describe('search', () => {
  it('finds lessons and questions for anyone, signed in or not', async () => {
    const { status, body } = await search('q=counter');
    expect(status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(body.hits[0]).toMatchObject({ conceptId: 'loops.counter' });
    expect(body.hits[0].snippet.length).toBeGreaterThan(0);
  });

  it('searches in either language and narrows by kind', async () => {
    const hinglish = await search('q=gate&locale=hi-Latn');
    expect(hinglish.body.hits.length).toBeGreaterThan(0);
    const mistakes = await search('q=thinking&type=misconception');
    expect(mistakes.body.hits.length).toBeGreaterThan(0);
    expect(mistakes.body.hits.every((h: { type: string }) => h.type === 'misconception')).toBe(
      true,
    );
    expect((await search('q=program&limit=1')).body.hits).toHaveLength(1);
  });

  it('refuses a search without words or with a silly limit', async () => {
    expect((await search('q=')).status).toBe(400);
    expect((await search('limit=5')).status).toBe(400);
    expect((await search('q=x&limit=500')).status).toBe(400);
    expect((await search('q=zzzzqqqq')).body).toEqual({ hits: [], total: 0 });
  });

  it('searches the new curriculum once a version is published', async () => {
    expect((await search('q=quokka')).body.total).toBe(0);
    const bundle = JSON.parse(readFileSync(bundleFile, 'utf8'));
    bundle.version = 'changed';
    bundle.concepts.find((c: { published: boolean }) => c.published).title.en = 'Quokka counting';
    writeFileSync(bundleFile, JSON.stringify(bundle));
    const bus = await testBus(prefix);
    await bus.publish(
      makeEvent(
        'content.version.published',
        {
          versionId: crypto.randomUUID(),
          number: 2,
          checksum: 'changed',
          submissionId: null,
          publishedBy: null,
        },
        'content',
      ),
    );
    await bus.close();
    await eventually(async () => (await search('q=quokka')).body.total > 0);
    expect((await search('q=quokka')).body.hits[0].title).toBe('Quokka counting');
  });
});

describe('search contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('search'));
  });
});
