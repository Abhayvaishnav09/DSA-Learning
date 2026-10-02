import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Feature flags and remote config. A flag with no row does not exist. */
export const flags = pgTable('flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull(),
  rolloutPercent: integer('rollout_percent').notNull().default(100),
  roles: text('roles', { enum: ['student', 'writer', 'admin'] })
    .array()
    .notNull()
    .default([]),
  platforms: text('platforms', { enum: ['web', 'android'] })
    .array()
    .notNull()
    .default([]),
  minAppVersion: text('min_app_version'),
  value: jsonb('value').$type<unknown>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
