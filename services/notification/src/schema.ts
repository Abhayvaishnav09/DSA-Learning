import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** A learner's inbox. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    kind: text('kind', {
      enum: ['review_due', 'badge', 'level_up', 'league', 'class', 'submission', 'system'],
    }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** What caused it: the same cause never makes a second notification, even if replayed. */
    dedupeKey: text('dedupe_key').notNull().unique(),
  },
  (t) => [index('notifications_inbox').on(t.userId, t.createdAt.desc(), t.id.desc())],
);

export const prefs = pgTable('prefs', {
  userId: uuid('user_id').primaryKey(),
  reviewReminders: boolean('review_reminders').notNull().default(true),
  weeklySummary: boolean('weekly_summary').notNull().default(true),
  productNews: boolean('product_news').notNull().default(false),
});

/** Who to write to, and in which language and time zone (kept from identity and profile events). */
export const people = pgTable('people', {
  userId: uuid('user_id').primaryKey(),
  email: text('email'),
  name: text('name').notNull(),
  locale: text('locale', { enum: ['en', 'hi-Latn'] })
    .notNull()
    .default('en'),
  timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
});

/** When each review card is next due, from `review.card.scheduled`: enough to know who has reviews waiting. */
export const cardDue = pgTable(
  'card_due',
  {
    userId: uuid('user_id').notNull(),
    cardId: text('card_id').notNull(),
    due: timestamp('due', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] }), index('card_due_when').on(t.due)],
);

/** One review reminder per person per local day. */
export const reminders = pgTable('reminders', {
  userId: uuid('user_id').primaryKey(),
  lastRemindedOn: date('last_reminded_on', { mode: 'string' }).notNull(),
});

/** Approved submissions, so the writer can be told when theirs is live (or failed to publish). */
export const submissions = pgTable('submissions', {
  submissionId: uuid('submission_id').primaryKey(),
  authorId: uuid('author_id').notNull(),
  title: text('title').notNull(),
});

/** Emails waiting to go out (and a record of what went). */
export const mails = pgTable(
  'mails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toEmail: text('to_email').notNull(),
    /** The person it is about, so it can be erased with them. */
    userId: uuid('user_id'),
    subject: text('subject').notNull(),
    text: text('text').notNull(),
    status: text('status', { enum: ['queued', 'sent', 'skipped', 'failed'] })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    dedupeKey: text('dedupe_key').notNull().unique(),
  },
  (t) => [index('mails_queue').on(t.status, t.nextAttemptAt)],
);
