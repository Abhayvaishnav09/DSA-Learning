import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  locale: text('locale', { enum: ['en', 'hi-Latn'] })
    .notNull()
    .default('en'),
  timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(10),
  theme: text('theme', { enum: ['system', 'light', 'dark'] })
    .notNull()
    .default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
