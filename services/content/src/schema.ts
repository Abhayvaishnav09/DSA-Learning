import { integer, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ContentBundle } from '@logicpath/content-schema';

/** Every published curriculum, kept forever so any version can be restored. */
export const versions = pgTable('versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: integer('number').notNull().unique(),
  checksum: text('checksum').notNull(),
  bundle: jsonb('bundle').$type<ContentBundle>().notNull(),
  note: text('note').notNull(),
  submissionId: uuid('submission_id'),
  publishedBy: uuid('published_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row: which version learners get. Rollback moves this pointer by publishing a copy. */
export const current = pgTable('current_version', {
  id: smallint('id').primaryKey().default(1),
  versionId: uuid('version_id')
    .notNull()
    .references(() => versions.id),
});
