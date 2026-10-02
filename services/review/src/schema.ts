import type { ReviewCard } from '@logicpath/learning-engine';
import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** One review card per learner per question family: when it is next due, and how well it is known. */
export const cards = pgTable(
  'cards',
  {
    userId: uuid('user_id').notNull(),
    cardId: text('card_id').notNull(),
    conceptId: text('concept_id').notNull(),
    /** Also inside `card`; a column of its own so "what is due" is an index lookup. */
    due: timestamp('due', { withTimezone: true }).notNull(),
    card: jsonb('card').$type<ReviewCard>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] }), index('cards_due').on(t.userId, t.due)],
);

/** The time zone that decides what "today" means for each learner, kept from profile events. */
export const prefs = pgTable('prefs', {
  userId: uuid('user_id').primaryKey(),
  timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
});
