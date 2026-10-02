import type { learning } from '@logicpath/contracts';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Every answer a learner has given: the record behind the dashboards and the retry check. */
export const attempts = pgTable(
  'attempts',
  {
    /** Chosen by the device, so a retried answer is recognised and counted once. */
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    itemId: text('item_id').notNull(),
    conceptId: text('concept_id').notNull(),
    correct: boolean('correct').notNull(),
    source: text('source', { enum: ['lesson', 'predict', 'review'] }).notNull(),
    hintLevel: integer('hint_level').notNull(),
    durationMs: integer('duration_ms').notNull(),
    contentVersion: integer('content_version').notNull(),
    misconception: text('misconception'),
    solutionShown: boolean('solution_shown').notNull(),
    /** When it happened on the device (clamped if the clock ran ahead). */
    at: timestamp('at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** What the learner was told, so a retry gets the same answer back. */
    result: jsonb('result')
      .$type<Omit<learning.AttemptResult, 'attemptId' | 'duplicate'>>()
      .notNull(),
  },
  (t) => [index('attempts_by_user').on(t.userId, t.createdAt.desc())],
);
