import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** A parent's request to approve a child's account (DPDP Act: under 18 needs a parent's yes). */
export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    childName: text('child_name').notNull(),
    parentEmail: text('parent_email').notNull(),
    locale: text('locale', { enum: ['en', 'hi-Latn'] }).notNull(),
    /** Only a hash of the link's token is kept; the link itself is in the email. */
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status', { enum: ['pending', 'granted', 'denied', 'expired'] })
      .notNull()
      .default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    index('requests_user').on(t.userId),
    index('requests_listing').on(t.requestedAt.desc(), t.id.desc()),
  ],
);

/** Email addresses, so the shared demo accounts can be told apart from real ones. */
export const people = pgTable('people', {
  userId: uuid('user_id').primaryKey(),
  email: text('email').notNull(),
});

/** A request to erase a person: done when every service that holds their data has said so. */
export const deletions = pgTable('deletions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const deletionSteps = pgTable(
  'deletion_steps',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => deletions.id, { onDelete: 'cascade' }),
    service: text('service').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.service] })],
);
