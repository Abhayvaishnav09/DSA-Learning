import {
  makeEvent,
  type EventData,
  type EventEnvelope,
  type EventType,
} from '@logicpath/contracts';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { EventBus } from './bus';
import type { Tx } from './db';

/**
 * Transactional outbox: the event row is written in the same transaction as the state change,
 * so "saved but never announced" and "announced but never saved" are impossible.
 */
export async function emit<T extends EventType>(
  tx: Tx,
  source: string,
  type: T,
  data: EventData<T>,
): Promise<EventEnvelope<T>> {
  const envelope = makeEvent(type, data, source);
  await tx.execute(
    sql`INSERT INTO kit_outbox (event_id, type, envelope) VALUES (${envelope.id}, ${type}, ${JSON.stringify(envelope)}::jsonb)`,
  );
  return envelope;
}

/** Moves outbox rows to the bus. Several replicas can run it: rows are claimed with SKIP LOCKED. */
export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private busy: Promise<number> | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly bus: EventBus,
    private readonly log: Logger,
    private readonly intervalMs = 100,
  ) {}

  start(): void {
    const tick = () => {
      void this.drain()
        .catch((error) => this.log.error({ err: error }, 'outbox relay failed'))
        .finally(() => {
          if (this.timer) this.timer = setTimeout(tick, this.intervalMs);
        });
    };
    this.timer = setTimeout(tick, 0);
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.busy;
  }

  /** Publishes everything pending; returns how many events went out. */
  async drain(): Promise<number> {
    if (this.busy) return this.busy;
    this.busy = this.drainBatches().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  private async drainBatches(): Promise<number> {
    let total = 0;
    for (;;) {
      const sent = await this.drainOnce();
      total += sent;
      if (sent === 0) return total;
    }
  }

  private async drainOnce(): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ seq: string; envelope: EventEnvelope }>(
        `SELECT seq, envelope FROM kit_outbox WHERE published_at IS NULL
         ORDER BY seq LIMIT 100 FOR UPDATE SKIP LOCKED`,
      );
      for (const row of rows) await this.bus.publish(row.envelope);
      if (rows.length > 0) {
        await client.query(
          'UPDATE kit_outbox SET published_at = now() WHERE seq = ANY($1::bigint[])',
          [rows.map((r) => r.seq)],
        );
      }
      await client.query('COMMIT');
      return rows.length;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Runs `handle` at most once per (consumer, event): the inbox row and the handler's writes
 * commit together, so a redelivered event is skipped.
 */
export async function handleOnce(
  db: { transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> },
  consumer: string,
  eventId: string,
  handle: (tx: Tx) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx.execute(
      sql`INSERT INTO kit_inbox (consumer, event_id) VALUES (${consumer}, ${eventId}) ON CONFLICT DO NOTHING RETURNING event_id`,
    );
    if (inserted.rows.length === 0) return false;
    await handle(tx);
    return true;
  });
}
