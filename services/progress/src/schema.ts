import type { internal } from '@logicpath/contracts';
import type { LearnerState } from '@logicpath/progress-rules';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Everything one learner has learned (mastery per concept, lessons, streak, the days' totals). */
export const learners = pgTable('learners', {
  userId: uuid('user_id').primaryKey(),
  state: jsonb('state').$type<LearnerState>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Answers already applied, with what they did, so a retried answer is never counted twice. */
export const appliedAttempts = pgTable(
  'applied_attempts',
  {
    attemptId: uuid('attempt_id').primaryKey(),
    userId: uuid('user_id').notNull(),
    outcome: jsonb('outcome').$type<StoredOutcome>().notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('applied_attempts_when').on(t.appliedAt)],
);

/** The settings that change how a day is counted, kept from profile events. */
export const prefs = pgTable('prefs', {
  userId: uuid('user_id').primaryKey(),
  timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(10),
});

export type StoredOutcome = Omit<internal.AppliedAttempt, 'duplicate'>;
