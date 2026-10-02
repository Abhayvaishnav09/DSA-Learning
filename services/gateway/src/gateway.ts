import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import httpProxy from '@fastify/http-proxy';
import rateLimit from '@fastify/rate-limit';
import type { loadConfig } from '@logicpath/service-kit';
import type { home, learning, profile } from '@logicpath/contracts';
import {
  bearerToken,
  createVerifier,
  HttpProblem,
  internalFetch,
  problemType,
  requireUser,
  tooManyRequests,
} from '@logicpath/service-kit';
import Fastify, { LogController, type FastifyError, type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import { DEFAULT_PORTS, ROUTES, SENSITIVE_PATHS, SERVICE_NAMES, type ServiceName } from './routes';

export const env = {
  REDIS_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  SERVICE_HOST: z.string().default('127.0.0.1'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(600),
  /** How long the dashboard waits for each service before it shows safe defaults for that part. */
  HOME_TIMEOUT_MS: z.coerce.number().int().min(50).default(2500),
  SENSITIVE_LIMIT_PER_MINUTE: z.coerce.number().int().default(20),
  ...Object.fromEntries(
    SERVICE_NAMES.map((name) => [`${name.toUpperCase()}_URL`, z.string().optional()]),
  ),
};
export type GatewayConfig = ReturnType<typeof loadConfig<typeof env>>;

export function serviceUrl(config: GatewayConfig, name: ServiceName): string {
  const override = (config as unknown as Record<string, string | undefined>)[
    `${name.toUpperCase()}_URL`
  ];
  return override ?? `http://${config.SERVICE_HOST}:${DEFAULT_PORTS[name]}`;
}

/**
 * The single public entry point (ADR-0015): routing to services, token verification,
 * rate limiting, CORS, request ids. Services still check auth themselves (defence in depth).
 */
export async function createGateway(config: GatewayConfig): Promise<FastifyInstance> {
  const log = pino({ name: 'gateway', level: config.LOG_LEVEL });
  const app = Fastify({
    loggerInstance: log,
    genReqId: (req) => String(req.headers['x-request-id'] ?? randomUUID()),
    trustProxy: true,
    logController: new LogController({ disableRequestLogging: config.LOG_LEVEL !== 'debug' }),
  }) as unknown as FastifyInstance;

  const verify = createVerifier({
    JWKS_URL: config.JWKS_URL ?? `${serviceUrl(config, 'identity')}/.well-known/jwks.json`,
    JWT_PUBLIC_JWK: config.JWT_PUBLIC_JWK,
    JWT_ISSUER: config.JWT_ISSUER,
    JWT_AUDIENCE: config.JWT_AUDIENCE,
  });

  app.setErrorHandler((error: FastifyError | HttpProblem, request, reply) => {
    const status = error instanceof HttpProblem ? error.status : (error.statusCode ?? 500);
    if (status >= 500) request.log.error({ err: error }, 'gateway error');
    const slug =
      error instanceof HttpProblem ? error.slug : status === 429 ? 'rate-limited' : 'gateway';
    void reply
      .status(status)
      .type('application/problem+json')
      .send(
        JSON.stringify({
          type: problemType(slug),
          title:
            status === 429
              ? 'Too many requests'
              : error instanceof HttpProblem
                ? error.title
                : status >= 500
                  ? 'Upstream unavailable'
                  : 'Bad request',
          status,
          detail: status >= 500 ? undefined : error.message,
          instance: request.url,
          traceId: request.id,
        }),
      );
  });

  const appCors = {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    exposedHeaders: [
      'x-request-id',
      'etag',
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
    ],
  };
  await app.register(cors, {
    // The public API is meant for other people's websites: no cookies, any origin, a key header.
    delegator: (request, callback) =>
      callback(
        null,
        request.url.startsWith('/public/v1')
          ? {
              origin: '*',
              credentials: false,
              allowedHeaders: ['x-api-key', 'content-type'],
              exposedHeaders: ['x-request-id', 'x-quota-limit', 'x-quota-remaining'],
            }
          : appCors,
      ),
  });

  const redis = config.REDIS_URL
    ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: false })
    : undefined;
  await app.register(rateLimit, {
    global: true,
    ...(redis ? { redis } : {}),
    max: (request) =>
      SENSITIVE_PATHS.has(request.url.split('?')[0]!)
        ? config.SENSITIVE_LIMIT_PER_MINUTE
        : config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const sensitive = SENSITIVE_PATHS.has(request.url.split('?')[0]!);
      return `${sensitive ? 's' : 'g'}:${request.user?.id ?? request.ip}`;
    },
    enableDraftSpec: true,
    skipOnError: true,
  });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    request.headers['x-request-id'] = request.id;
    const token = bearerToken(request);
    // Reject bad tokens at the edge; services verify again.
    if (token) request.user = await verify(token);
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('strict-transport-security', 'max-age=63072000; includeSubDomains');
  });

  // ---------- the public API: a key per developer, a daily quota per key ----------

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/public/v1') || request.method === 'OPTIONS') return;
    const secret = request.headers['x-api-key'];
    if (typeof secret !== 'string' || secret.length < 10) {
      throw new HttpProblem(
        401,
        'api-key',
        'API key required',
        'Send your key in an X-API-Key header',
      );
    }
    type Verdict =
      | { valid: false }
      | { valid: true; allowed: boolean; keyId: string; dailyQuota: number; requestsToday: number };
    let verdict: Verdict;
    try {
      verdict = await internalFetch<Verdict>(
        config,
        `${serviceUrl(config, 'developer')}/internal/keys/verify`,
        { method: 'POST', body: JSON.stringify({ secret, scope: 'curriculum:read' }) },
        5_000,
      );
    } catch (error) {
      request.log.error({ err: error }, 'api key check failed');
      throw new HttpProblem(503, 'unavailable', 'Not available right now', 'Try again in a moment');
    }
    if (!verdict.valid) {
      throw new HttpProblem(
        401,
        'api-key',
        'API key not valid',
        'This key is wrong, revoked, or lacks access',
      );
    }
    reply.header('x-quota-limit', String(verdict.dailyQuota));
    reply.header(
      'x-quota-remaining',
      String(Math.max(0, verdict.dailyQuota - verdict.requestsToday)),
    );
    if (!verdict.allowed) {
      throw tooManyRequests(
        'This key has used its requests for today. It resets at midnight, India time.',
      );
    }
    // Services see who is asking, never the secret itself.
    delete request.headers['x-api-key'];
    request.headers['x-api-key-id'] = verdict.keyId;
  });

  // ---------- the dashboard in one call ----------

  app.get('/v1/home', async (request, reply) => {
    const me = requireUser(request);
    const query = request.query as { platform?: string; appVersion?: string };
    const platform = query.platform === 'android' ? 'android' : 'web';
    const headers = {
      authorization: request.headers.authorization!,
      'x-request-id': request.id,
    };
    const part = async <T>(name: ServiceName, path: string): Promise<T | null> => {
      try {
        const response = await fetch(`${serviceUrl(config, name)}${path}`, {
          headers,
          signal: AbortSignal.timeout(config.HOME_TIMEOUT_MS),
        });
        return response.ok ? ((await response.json()) as T) : null;
      } catch (error) {
        request.log.warn({ err: error, service: name }, 'dashboard part unavailable');
        return null;
      }
    };
    const [prof, progress, reviews, rewards, league, notifications, flags] = await Promise.all([
      part<profile.Profile>('profile', '/v1/me/profile'),
      part<learning.ProgressMap>('progress', '/v1/progress'),
      part<learning.ReviewSummary>('review', '/v1/reviews/summary'),
      part<home.Home['rewards']>('gamification', '/v1/rewards/me'),
      part<home.Home['league']>('leaderboard', '/v1/leaderboard/league'),
      part<{ unreadCount: number }>('notification', '/v1/notifications?limit=1'),
      part<home.Home['flags']>(
        'flags',
        `/v1/flags?platform=${platform}${query.appVersion ? `&appVersion=${encodeURIComponent(query.appVersion)}` : ''}`,
      ),
    ]);

    const now = new Date();
    const partial: string[] = [];
    const take = <T>(value: T | null, name: string, fallback: T): T => {
      if (value === null) partial.push(name);
      return value ?? fallback;
    };
    const result: home.Home = {
      profile: take(prof, 'profile', {
        userId: me.id,
        displayName: me.name,
        locale: 'en',
        timeZone: 'Asia/Kolkata',
        dailyGoalMinutes: 10,
        theme: 'system',
        updatedAt: now.toISOString(),
      }),
      progress: take(progress, 'progress', {
        contentVersion: 0,
        concepts: [],
        lessons: [],
        streak: { current: 0, longest: 0, lastActiveOn: null },
        today: {
          localDate: now.toISOString().slice(0, 10),
          minutes: 0,
          goalMinutes: 10,
          itemsCompleted: 0,
          lessonsCompleted: 0,
        },
      }),
      reviews: take(reviews, 'review', { dueNow: 0, dueToday: 0, total: 0, nextDueAt: null }),
      rewards: take(rewards, 'gamification', {
        xp: 0,
        level: 1,
        levelFloorXp: 0,
        nextLevelXp: 100,
        xpThisWeek: 0,
        badges: [],
        recent: [],
      }),
      league: take(league, 'leaderboard', null),
      unreadNotifications: take(notifications, 'notification', { unreadCount: 0 }).unreadCount,
      flags: take(flags, 'flags', { flags: {} }),
      partial,
    };
    reply.header('cache-control', 'private, no-store');
    return result;
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  for (const route of ROUTES) {
    await app.register(httpProxy, {
      upstream: serviceUrl(config, route.service),
      prefix: route.prefix,
      rewritePrefix: route.prefix,
      http: { requestOptions: { timeout: 15_000 } },
      replyOptions: {
        rewriteRequestHeaders: (request, headers) => ({
          ...headers,
          'x-request-id': request.id,
          'x-forwarded-by': 'gateway',
        }),
      },
    });
  }

  app.addHook('onClose', async () => {
    await redis?.quit().catch(() => {});
  });
  return app;
}
