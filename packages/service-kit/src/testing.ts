import { randomBytes } from 'node:crypto';
import { parseEvent, type EventEnvelope, type EventType } from '@logicpath/contracts';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';

/**
 * Integration-test helpers. Tests run against the real dev stack (Postgres + NATS from
 * `pnpm stack:infra`, or CI service containers): each test file gets a fresh database and a
 * random event prefix, so parallel runs never see each other's data or events.
 */

const ADMIN_URL = process.env.TEST_PG_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
export const TEST_NATS_URL = process.env.TEST_NATS_URL ?? 'nats://127.0.0.1:4222';

export async function createTestDatabase(
  label: string,
): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `test_${label}_${randomBytes(4).toString('hex')}`.replace(/[^a-z0-9_]/g, '_');
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const client = new pg.Client({ connectionString: ADMIN_URL });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.end();
    },
  };
}

export const testPrefix = () => `t${randomBytes(4).toString('hex')}`;

/** A signing key pair standing in for identity, so other services' tests can mint tokens. */
export async function testKeys() {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  const publicJwk = JSON.stringify(await exportJWK(publicKey));
  const token = (sub: string, role: 'student' | 'writer' | 'admin', name = 'Test User') =>
    new SignJWT({ role, name })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(sub)
      .setIssuer('logicpath-identity')
      .setAudience('logicpath')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
  return { publicJwk, token };
}

/** Reads events a service wrote to its outbox (what it will publish). */
export async function outboxEvents(
  databaseUrl: string,
  type?: EventType,
): Promise<EventEnvelope[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const { rows } = await client.query<{ envelope: unknown }>(
    type
      ? 'SELECT envelope FROM kit_outbox WHERE type = $1 ORDER BY seq'
      : 'SELECT envelope FROM kit_outbox ORDER BY seq',
    type ? [type] : [],
  );
  await client.end();
  return rows.map((r) => parseEvent(r.envelope));
}

export async function eventually<T>(
  fn: () => Promise<T | undefined | null | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `condition not met in ${timeoutMs}ms${lastError ? `: ${String(lastError)}` : ''}`,
  );
}

export function baseTestEnv(
  service: string,
  databaseUrl: string,
  prefix: string,
  extra: Record<string, string> = {},
) {
  return {
    SERVICE_NAME: service,
    HOST: '127.0.0.1',
    PORT: '0',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    DATABASE_URL: databaseUrl,
    NATS_URL: TEST_NATS_URL,
    EVENT_PREFIX: prefix,
    ...extra,
  };
}

/** A bus client for tests: publish events into a service's world, or watch what it emits. */
export async function testBus(prefix: string) {
  const { EventBus } = await import('./bus');
  const pino = (await import('pino')).default;
  return EventBus.connect(TEST_NATS_URL, prefix, pino({ level: 'silent' }));
}
