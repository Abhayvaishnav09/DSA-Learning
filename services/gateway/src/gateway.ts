import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import httpProxy from '@fastify/http-proxy';
import rateLimit from '@fastify/rate-limit';
import type { loadConfig } from '@logicpath/service-kit';
import { bearerToken, createVerifier, HttpProblem, problemType } from '@logicpath/service-kit';
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

  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    exposedHeaders: [
      'x-request-id',
      'etag',
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
    ],
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
