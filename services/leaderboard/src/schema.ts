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

/** Everyone who plays in the leagues, and the tier they are in now. */
export const members = pgTable(
  'members',
  {
    userId: uuid('user_id').primaryKey(),
    name: text('name').notNull(),
    tier: text('tier', { enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'] })
      .notNull()
      .default('bronze'),
    /** A child's place waits for a parent's approval. */
    active: boolean('active').notNull().default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('members_group').on(t.tier, t.joinedAt, t.userId)],
);

/** XP per learner per week (Monday, India time), from `gamification.xp.awarded`. */
export const weeklyXp = pgTable(
  'weekly_xp',
  {
    userId: uuid('user_id').notNull(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    xp: integer('xp').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.weekStart] }),
    index('weekly_xp_week').on(t.weekStart),
  ],
);

/** How each finished week went for each learner. */
export const history = pgTable(
  'history',
  {
    userId: uuid('user_id').notNull(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    tier: text('tier', { enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'] }).notNull(),
    rank: integer('rank').notNull(),
    xp: integer('xp').notNull(),
    result: text('result', { enum: ['promoted', 'stayed', 'demoted'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart] })],
);

/** Weeks already closed, so a week is never settled twice. */
export const settledWeeks = pgTable('settled_weeks', {
  weekStart: date('week_start', { mode: 'string' }).primaryKey(),
  settledAt: timestamp('settled_at', { withTimezone: true }).notNull().defaultNow(),
});
