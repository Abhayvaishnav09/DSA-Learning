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

/** A class run by a writer or an admin. Learners join with the six-character code. */
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    ownerId: uuid('owner_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('classes_owner').on(t.ownerId),
    index('classes_created').on(t.createdAt.desc(), t.id.desc()),
  ],
);

export const members = pgTable(
  'members',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.userId] }), index('members_user').on(t.userId)],
);

/** Names and roles, kept from identity and profile events (a class page shows names, not ids). */
export const people = pgTable('people', {
  userId: uuid('user_id').primaryKey(),
  name: text('name').notNull(),
  role: text('role', { enum: ['student', 'writer', 'admin'] })
    .notNull()
    .default('student'),
});

/** What a teacher sees about each learner, kept from progress events. */
export const learnerStats = pgTable('learner_stats', {
  userId: uuid('user_id').primaryKey(),
  conceptsMastered: integer('concepts_mastered').notNull().default(0),
  lastActiveOn: date('last_active_on', { mode: 'string' }),
});

/** XP per learner per week (Monday, India time), kept from gamification events. */
export const weeklyXp = pgTable(
  'weekly_xp',
  {
    userId: uuid('user_id').notNull(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    xp: integer('xp').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart] })],
);
