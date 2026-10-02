import type { LearnerStats } from '@logicpath/gamification-rules';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  bigserial,
} from 'drizzle-orm/pg-core';

/** Every payment of XP, newest last. The total is kept beside it so reading it is one row. */
export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    /** The Monday (India time) of the week it was earned in: the leagues count weeks from this. */
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('xp_ledger_user_week').on(t.userId, t.weekStart),
    index('xp_ledger_recent').on(t.userId, t.id.desc()),
  ],
);

export const totals = pgTable('totals', {
  userId: uuid('user_id').primaryKey(),
  xp: integer('xp').notNull().default(0),
});

/** The counters the badge rules read: answers, clean run, lessons, concepts, reviews, streak, … */
export const stats = pgTable('stats', {
  userId: uuid('user_id').primaryKey(),
  stats: jsonb('stats').$type<LearnerStats>().notNull(),
});

export const badges = pgTable(
  'badges',
  {
    userId: uuid('user_id').notNull(),
    badgeId: text('badge_id').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

/** The words XP reasons are shown in, from the learner's language (kept from profile events). */
export const prefs = pgTable('prefs', {
  userId: uuid('user_id').primaryKey(),
  locale: text('locale', { enum: ['en', 'hi-Latn'] })
    .notNull()
    .default('en'),
});
