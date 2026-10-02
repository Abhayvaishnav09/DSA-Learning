import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** One row per answer, as announced by the practice service: the raw material of the dashboards. */
export const attemptFacts = pgTable(
  'attempt_facts',
  {
    attemptId: uuid('attempt_id').primaryKey(),
    userId: uuid('user_id').notNull(),
    itemId: text('item_id').notNull(),
    conceptId: text('concept_id').notNull(),
    correct: boolean('correct').notNull(),
    hintLevel: integer('hint_level').notNull(),
    durationMs: integer('duration_ms').notNull(),
    misconception: text('misconception'),
    source: text('source', { enum: ['lesson', 'predict', 'review'] }).notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('attempt_facts_at').on(t.at),
    index('attempt_facts_item').on(t.itemId, t.userId, t.at),
    index('attempt_facts_user').on(t.userId),
  ],
);

export const signups = pgTable('signups', {
  userId: uuid('user_id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull(),
});

export const lessonCompletions = pgTable(
  'lesson_completions',
  {
    userId: uuid('user_id').notNull(),
    conceptId: text('concept_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.conceptId] }),
    index('lesson_completions_at').on(t.at),
  ],
);
