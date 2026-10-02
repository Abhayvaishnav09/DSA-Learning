import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** What the service needs to know about the people who ask for keys (from identity's events). */
export const owners = pgTable('owners', {
  userId: uuid('user_id').primaryKey(),
  birthYear: integer('birth_year').notNull(),
});

/** API keys for the public curriculum API. Only a hash of the secret is kept. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** First characters of the secret, so a person can recognise their key. */
    prefix: text('prefix').notNull(),
    secretHash: text('secret_hash').notNull().unique(),
    scopes: text('scopes', { enum: ['curriculum:read'] })
      .array()
      .notNull(),
    plan: text('plan', { enum: ['free', 'partner'] })
      .notNull()
      .default('free'),
    dailyQuota: integer('daily_quota').notNull(),
    ownerId: uuid('owner_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('api_keys_owner').on(t.ownerId),
    index('api_keys_created').on(t.createdAt.desc(), t.id.desc()),
  ],
);

/** Requests per key per day (India time, like the rest of the app's days). */
export const usage = pgTable(
  'api_key_usage',
  {
    keyId: uuid('key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    requests: integer('requests').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.keyId, t.day] })],
);
