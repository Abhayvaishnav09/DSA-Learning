import { createServer, type IncomingMessage, type Server } from 'node:http';
import { home, SERVICE_NAMES } from '@logicpath/contracts';
import { loadConfig } from '@logicpath/service-kit';
import { testKeys } from '@logicpath/service-kit/testing';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGateway, env } from '../src/gateway';

/** Every service behind the gateway, as one fake: /<service>/... Each can be switched off or slowed. */
const behaviour = { down: new Set<string>(), hang: new Set<string>() };
const seen: { service: string; path: string; headers: IncomingMessage['headers'] }[] = [];
const keysSeen: string[] = [];

const answers: Record<string, unknown> = {
  '/v1/me/profile': {
    userId: '6f1b4e3a-9c1d-4d5e-8a3b-0d2c7e9f1a22',
    displayName: 'Asha',
    locale: 'hi-Latn',
    timeZone: 'Asia/Kolkata',
    dailyGoalMinutes: 20,
    theme: 'dark',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  '/v1/progress': {
    contentVersion: 3,
    concepts: [],
    lessons: [],
    streak: { current: 4, longest: 9, lastActiveOn: '2026-10-02' },
    today: {
      localDate: '2026-10-02',
      minutes: 7.5,
      goalMinutes: 20,
      itemsCompleted: 3,
      lessonsCompleted: 1,
    },
  },
  '/v1/reviews/summary': {
    dueNow: 2,
    dueToday: 3,
    total: 11,
    nextDueAt: '2026-10-03T00:00:00.000Z',
  },
  '/v1/rewards/me': {
    xp: 140,
    level: 2,
    levelFloorXp: 100,
    nextLevelXp: 300,
    xpThisWeek: 40,
    badges: [],
    recent: [],
  },
  '/v1/leaderboard/league': {
    tier: 'silver',
    weekStart: '2026-09-28',
    endsAt: '2026-10-05T18:30:00.000Z',
    standings: [],
  },
  '/v1/notifications': { items: [], nextCursor: null, unreadCount: 5 },
  '/v1/flags': { flags: { 'map.3d': { on: true, value: null } } },
  '/public/v1/curriculum': { version: 'abc', stages: [], concepts: [] },
};

const upstreams: Server[] = [];
let gateway: FastifyInstance;
let token: string;

/** One tiny server per service, as in a real deployment where each has its own address. */
function fakeService(service: string): Promise<string> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]!;
    seen.push({ service, path, headers: req.headers });
    if (behaviour.hang.has(service)) return; // never answers
    if (behaviour.down.has(service)) return void res.writeHead(503).end();
    if (service === 'developer' && path === '/internal/keys/verify') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { secret } = JSON.parse(body) as { secret: string };
        keysSeen.push(secret);
        res.setHeader('content-type', 'application/json');
        if (secret === 'lp_live_goodgoodgood') {
          res.end(
            JSON.stringify({
              valid: true,
              allowed: true,
              keyId: 'key-1',
              plan: 'free',
              dailyQuota: 1000,
              requestsToday: 42,
            }),
          );
        } else if (secret === 'lp_live_spentspentspent') {
          res.end(
            JSON.stringify({
              valid: true,
              allowed: false,
              keyId: 'key-2',
              plan: 'free',
              dailyQuota: 1000,
              requestsToday: 1000,
            }),
          );
        } else res.end(JSON.stringify({ valid: false }));
      });
      return;
    }
    const answer = answers[path];
    res.setHeader('content-type', 'application/json');
    res.writeHead(answer ? 200 : 404).end(JSON.stringify(answer ?? {}));
  });
  upstreams.push(server);
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`),
    ),
  );
}

beforeAll(async () => {
  const urls = Object.fromEntries(
    await Promise.all(
      SERVICE_NAMES.map(async (n) => [`${n.toUpperCase()}_URL`, await fakeService(n)] as const),
    ),
  );
  const keys = await testKeys();
  token = await keys.token(crypto.randomUUID(), 'student', 'Asha Verma');
  gateway = await createGateway(
    loadConfig(env, {
      SERVICE_NAME: 'gateway',
      LOG_LEVEL: 'silent',
      JWT_PUBLIC_JWK: keys.publicJwk,
      HOME_TIMEOUT_MS: '300',
      CORS_ORIGINS: 'https://web.example.test',
      ...urls,
    }),
  );
});

afterAll(async () => {
  await gateway?.close();
  await Promise.all(upstreams.map((u) => new Promise((r) => u.close(r))));
});

const call = async (url: string, headers: Record<string, string> = {}, method = 'GET') => {
  const res = await gateway.inject({ method: method as 'GET', url, headers });
  return {
    status: res.statusCode,
    body: res.body ? (res.json() as Record<string, any>) : {},
    headers: res.headers,
  };
};

describe('the dashboard in one call', () => {
  it('gathers every part from its service, for the signed-in learner', async () => {
    seen.length = 0;
    const res = await call('/v1/home', { authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(home.Home.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      profile: { displayName: 'Asha', locale: 'hi-Latn' },
      progress: { streak: { current: 4 }, contentVersion: 3 },
      reviews: { dueNow: 2 },
      rewards: { xp: 140, level: 2 },
      league: { tier: 'silver' },
      unreadNotifications: 5,
      flags: { flags: { 'map.3d': { on: true } } },
      partial: [],
    });
    expect(res.headers['cache-control']).toBe('private, no-store');
    // each service was asked with the learner's own token, so each decides what they may see
    expect(new Set(seen.map((s) => s.service))).toEqual(
      new Set([
        'profile',
        'progress',
        'review',
        'gamification',
        'leaderboard',
        'notification',
        'flags',
      ]),
    );
    expect(seen.every((s) => s.headers.authorization === `Bearer ${token}`)).toBe(true);
  });

  it('asks for the flags of the platform it is told about', async () => {
    seen.length = 0;
    await call('/v1/home?platform=android&appVersion=1.4.0', { authorization: `Bearer ${token}` });
    expect(seen.find((s) => s.service === 'flags')).toBeTruthy();
    const flagsCall = await gateway.inject({
      method: 'GET',
      url: '/v1/home?platform=nonsense',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(flagsCall.statusCode).toBe(200);
  });

  it('needs a signed-in learner', async () => {
    expect((await call('/v1/home')).status).toBe(401);
    expect((await call('/v1/home', { authorization: 'Bearer nonsense' })).status).toBe(401);
  });

  it('still answers when a service is down, with safe defaults for its part and a note of what is missing', async () => {
    behaviour.down.add('review');
    behaviour.down.add('leaderboard');
    const res = await call('/v1/home', { authorization: `Bearer ${token}` });
    behaviour.down.clear();
    expect(res.status).toBe(200);
    expect(home.Home.safeParse(res.body).success).toBe(true);
    expect(res.body.partial.sort()).toEqual(['leaderboard', 'review']);
    expect(res.body.reviews).toEqual({ dueNow: 0, dueToday: 0, total: 0, nextDueAt: null });
    expect(res.body.league).toBeNull();
    expect(res.body.progress.streak.current).toBe(4); // the rest is real
  });

  it('does not wait for a service that never answers', async () => {
    behaviour.hang.add('gamification');
    const started = Date.now();
    const res = await call('/v1/home', { authorization: `Bearer ${token}` });
    behaviour.hang.clear();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.status).toBe(200);
    expect(res.body.partial).toEqual(['gamification']);
    expect(res.body.rewards).toMatchObject({ xp: 0, level: 1 });
  });

  it('shows the profile from the sign-in when the profile service is away', async () => {
    behaviour.down.add('profile');
    const res = await call('/v1/home', { authorization: `Bearer ${token}` });
    behaviour.down.clear();
    expect(res.body.profile).toMatchObject({
      displayName: 'Asha Verma',
      locale: 'en',
      dailyGoalMinutes: 10,
    });
    expect(res.body.partial).toEqual(['profile']);
  });
});

describe('the public API', () => {
  it('needs a key', async () => {
    const none = await call('/public/v1/curriculum');
    expect(none.status).toBe(401);
    expect(none.headers['content-type']).toContain('application/problem+json');
    expect(none.body.detail).toMatch(/X-API-Key/);
    expect((await call('/public/v1/curriculum', { 'x-api-key': 'short' })).status).toBe(401);
    const wrong = await call('/public/v1/curriculum', { 'x-api-key': 'lp_live_wrongwrongwrong' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.title).toBe('API key not valid');
  });

  it('serves a good key, says how much of its day is left, and keeps the secret from the services', async () => {
    seen.length = 0;
    const res = await call('/public/v1/curriculum', { 'x-api-key': 'lp_live_goodgoodgood' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: 'abc', stages: [], concepts: [] });
    expect(res.headers['x-quota-limit']).toBe('1000');
    expect(res.headers['x-quota-remaining']).toBe('958');
    const forwarded = seen.find((s) => s.service === 'content')!;
    expect(forwarded.headers['x-api-key']).toBeUndefined();
    expect(forwarded.headers['x-api-key-id']).toBe('key-1');
  });

  it('stops a key that has used its day, with the time to come back', async () => {
    const res = await call('/public/v1/curriculum', { 'x-api-key': 'lp_live_spentspentspent' });
    expect(res.status).toBe(429);
    expect(res.body.detail).toMatch(/midnight/);
    expect(res.headers['x-quota-remaining']).toBe('0');
  });

  it('says to try again when the key check is unavailable', async () => {
    behaviour.down.add('developer');
    const res = await call('/public/v1/curriculum', { 'x-api-key': 'lp_live_goodgoodgood' });
    behaviour.down.clear();
    expect(res.status).toBe(503);
  });

  it('is open to any website, without cookies, while the app’s own API is not', async () => {
    const pre = await call(
      '/public/v1/curriculum',
      {
        origin: 'https://someone-else.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-api-key',
      },
      'OPTIONS',
    );
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('*');
    expect(String(pre.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'x-api-key',
    );
    expect(pre.headers['access-control-allow-credentials']).toBeUndefined();
    const own = await call('/v1/home', {
      origin: 'https://someone-else.example',
      authorization: `Bearer ${token}`,
    });
    expect(own.headers['access-control-allow-origin']).toBeUndefined();
    const ours = await call('/v1/home', {
      origin: 'https://web.example.test',
      authorization: `Bearer ${token}`,
    });
    expect(ours.headers['access-control-allow-origin']).toBe('https://web.example.test');
    expect(ours.headers['access-control-allow-credentials']).toBe('true');
  });
});
