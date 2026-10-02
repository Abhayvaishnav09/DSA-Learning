import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Every privileged action anyone took, in the order it happened. Rows are never edited. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The event that reported it: replays of the same event cannot add a second row. */
    eventId: uuid('event_id').notNull().unique(),
    actorId: uuid('actor_id'),
    actorRole: text('actor_role', { enum: ['student', 'writer', 'admin'] }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('audit_log_at').on(t.at.desc(), t.id.desc()),
    index('audit_log_actor').on(t.actorId),
  ],
);
