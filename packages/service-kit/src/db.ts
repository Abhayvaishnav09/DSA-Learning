import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export type Db = NodePgDatabase<Record<string, never>>;
/** A transaction or the database: both run queries the same way. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

export interface Database {
  pool: pg.Pool;
  db: Db;
  close: () => Promise<void>;
}

export function openDatabase(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  const db = drizzle(pool) as Db;
  return { pool, db, close: () => pool.end() };
}

/**
 * Infrastructure tables every service has: the transactional outbox (events waiting to be
 * published) and the inbox (events already handled, for idempotent consumers).
 */
const INFRA_SQL = `
CREATE TABLE IF NOT EXISTS kit_outbox (
  seq          bigserial PRIMARY KEY,
  event_id     uuid NOT NULL UNIQUE,
  type         text NOT NULL,
  envelope     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS kit_outbox_unpublished ON kit_outbox (seq) WHERE published_at IS NULL;
CREATE TABLE IF NOT EXISTS kit_inbox (
  consumer     text NOT NULL,
  event_id     uuid NOT NULL,
  handled_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
`;

export async function prepareDatabase(
  database: Database,
  migrationsFolder?: string,
): Promise<void> {
  // Several replicas may start at once: serialize schema changes with an advisory lock.
  const client = await database.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(INFRA_SQL);
    if (migrationsFolder) await migrate(drizzle(client) as Db, { migrationsFolder });
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}
