import { randomUUID } from 'node:crypto';
import fastifySwagger from '@fastify/swagger';
import { type EventData, type EventEnvelope, type EventType } from '@logicpath/contracts';
import Fastify, { LogController, type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { JWTVerifyGetKey } from 'jose';
import pino, { type Logger } from 'pino';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import { bearerToken, createVerifier, type VerifyToken } from './auth';
import { EventBus, type ConsumerSpec } from './bus';
import type { BaseConfig } from './config';
import { openDatabase, prepareDatabase, type Database, type Db, type Tx } from './db';
import { HttpProblem, problemType } from './errors';
import { emit, handleOnce, OutboxRelay } from './outbox';
import { retry } from './retry';

export type ZApp = ReturnType<typeof zodApp>;
export const zodApp = (app: FastifyInstance) => app.withTypeProvider<ZodTypeProvider>();

export interface ServiceContext<C extends BaseConfig> {
  config: C;
  log: Logger;
  db: Db;
  database: Database;
  bus: EventBus;
  verify: VerifyToken;
  /** Writes an event to the outbox inside the caller's transaction. */
  emit: <T extends EventType>(tx: Tx, type: T, data: EventData<T>) => Promise<EventEnvelope<T>>;
  /** Runs a consumer handler once per event id (idempotent consumer). */
  once: (
    consumer: string,
    event: EventEnvelope,
    handle: (tx: Tx) => Promise<void>,
  ) => Promise<boolean>;
}

export interface ServiceDefinition<C extends BaseConfig> {
  title: string;
  description: string;
  version?: string;
  config: C;
  migrationsFolder?: string;
  /** Lets identity verify with its own keys instead of fetching JWKS from itself. */
  keys?: () => JWTVerifyGetKey;
  routes: (app: ZApp, ctx: ServiceContext<C>) => void | Promise<void>;
  consumers?: (ctx: ServiceContext<C>) => ConsumerSpec[];
  onStart?: (ctx: ServiceContext<C>) => Promise<void> | void;
  onStop?: (ctx: ServiceContext<C>) => Promise<void> | void;
}

export interface RunningService<C extends BaseConfig> {
  app: FastifyInstance;
  ctx: ServiceContext<C>;
  url: string;
  relay: OutboxRelay;
  stop: () => Promise<void>;
}

const PROBLEM_JSON = 'application/problem+json';

/**
 * Boots a service the same way every time (ADR-0012): config, logs, database + outbox,
 * event bus, auth, OpenAPI, health, metrics, problem+json errors, graceful shutdown.
 */
export async function startService<C extends BaseConfig>(
  def: ServiceDefinition<C>,
): Promise<RunningService<C>> {
  const { config } = def;
  const log = pino({ name: config.SERVICE_NAME, level: config.LOG_LEVEL });

  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const database = openDatabase(config.DATABASE_URL);
  const onRetry = (step: string) => (error: unknown, attempt: number, waitMs: number) =>
    log.warn({ err: error, attempt, waitMs }, `${step} not ready yet, retrying`);
  await retry('database', () => prepareDatabase(database, def.migrationsFolder), {
    onRetry: onRetry('database'),
  });
  const bus = await retry(
    'message bus',
    () => EventBus.connect(config.NATS_URL, config.EVENT_PREFIX, log),
    {
      onRetry: onRetry('message bus'),
    },
  );
  const relay = new OutboxRelay(database.pool, bus, log);

  const ctx: ServiceContext<C> = {
    config,
    log,
    db: database.db,
    database,
    bus,
    verify: createVerifier(config, def.keys?.()),
    emit: (tx, type, data) => emit(tx, config.SERVICE_NAME, type, data),
    once: (consumer, event, handle) => handleOnce(database.db, consumer, event.id, handle),
  };

  const app = Fastify({
    loggerInstance: log,
    genReqId: (req) => String(req.headers['x-request-id'] ?? randomUUID()),
    logController: new LogController({
      disableRequestLogging: config.LOG_LEVEL !== 'debug' && config.LOG_LEVEL !== 'trace',
    }),
    trustProxy: true,
    bodyLimit: 1_048_576,
  }) as unknown as FastifyInstance;
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest('user', null);

  // Metrics
  const registry = new Registry();
  registry.setDefaultLabels({ service: config.SERVICE_NAME });
  collectDefaultMetrics({ register: registry });
  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    const token = bearerToken(request);
    if (token) request.user = await ctx.verify(token);
  });
  app.addHook('onResponse', async (request, reply) => {
    httpDuration
      .labels(request.method, request.routeOptions.url ?? 'unknown', String(reply.statusCode))
      .observe(reply.elapsedTime / 1000);
  });

  app.setErrorHandler((error: FastifyError | HttpProblem, request, reply) => {
    let problem: Record<string, unknown>;
    if (error instanceof HttpProblem) {
      problem = {
        type: problemType(error.slug),
        title: error.title,
        status: error.status,
        detail: error.detail,
        errors: error.errors,
      };
    } else if (hasZodFastifySchemaValidationErrors(error)) {
      problem = {
        type: problemType('validation'),
        title: 'Invalid request',
        status: 400,
        detail: 'Some fields are missing or invalid',
        errors: error.validation.map((v) => ({
          path: `${error.validationContext ?? 'body'}${v.instancePath.replaceAll('/', '.')}`,
          message: v.message ?? 'invalid',
        })),
      };
    } else if (error.statusCode && error.statusCode < 500) {
      problem = {
        type: problemType('request'),
        title: error.code ?? 'Bad request',
        status: error.statusCode,
        detail: error.message,
      };
    } else {
      request.log.error({ err: error }, 'unhandled error');
      problem = { type: problemType('internal'), title: 'Something went wrong', status: 500 };
    }
    problem.instance = request.url;
    problem.traceId = request.id;
    void reply
      .status(problem.status as number)
      .type(PROBLEM_JSON)
      .send(JSON.stringify(problem));
  });
  app.setNotFoundHandler((request, reply) => {
    void reply
      .status(404)
      .type(PROBLEM_JSON)
      .send(
        JSON.stringify({
          type: problemType('not-found'),
          title: 'Not found',
          status: 404,
          instance: request.url,
        }),
      );
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: def.title, description: def.description, version: def.version ?? '1.0.0' },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  const zapp = zodApp(app);
  zapp.get('/healthz', { schema: { hide: true } }, async () => ({ status: 'ok' }));
  zapp.get('/readyz', { schema: { hide: true } }, async (_request, reply) => {
    try {
      await database.pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'not ready' });
    }
  });
  zapp.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });
  zapp.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  await app.register(async (instance) => {
    await def.routes(zodApp(instance), ctx);
  });

  await app.ready();
  for (const consumer of def.consumers?.(ctx) ?? []) await bus.consume(consumer);
  relay.start();
  await def.onStart?.(ctx);

  const url = await app.listen({ host: config.HOST, port: config.PORT });
  log.info({ url }, `${config.SERVICE_NAME} listening`);

  let stopping: Promise<void> | null = null;
  const stop = () =>
    (stopping ??= (async () => {
      await def.onStop?.(ctx);
      await app.close();
      await relay.stop();
      await bus.close();
      await database.close();
    })());

  return { app, ctx, url, relay, stop };
}

/** Entry point helper: start, and shut down cleanly on SIGTERM/SIGINT (Kubernetes rolling updates). */
export async function runService<C extends BaseConfig>(def: ServiceDefinition<C>): Promise<void> {
  try {
    const service = await startService(def);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        service.ctx.log.info({ signal }, 'shutting down');
        void service.stop().then(() => process.exit(0));
      });
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
