import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['student', 'writer', 'admin'] })
      .notNull()
      .default('student'),
    status: text('status', { enum: ['active', 'pending_consent', 'suspended'] }).notNull(),
    birthYear: integer('birth_year').notNull(),
    locale: text('locale', { enum: ['en', 'hi-Latn'] })
      .notNull()
      .default('en'),
    parentEmail: text('parent_email'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_created_idx').on(t.createdAt, t.id), index('users_role_idx').on(t.role)],
);

/** Rotating refresh tokens: one family per login; reusing a rotated token revokes the family. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refresh_family_idx').on(t.familyId)],
);

export const oneTimeTokens = pgTable('one_time_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['verify_email', 'reset_password'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const signingKeys = pgTable('signing_keys', {
  kid: text('kid').primaryKey(),
  privateJwk: jsonb('private_jwk').notNull(),
  publicJwk: jsonb('public_jwk').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
});
