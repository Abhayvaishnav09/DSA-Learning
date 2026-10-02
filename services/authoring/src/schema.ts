import type { content } from '@logicpath/contracts';
import type { ContentBundle } from '@logicpath/content-schema';
import {
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    authorId: uuid('author_id').notNull(),
    authorName: text('author_name').notNull(),
    status: text('status', {
      enum: ['draft', 'in_review', 'changes_requested', 'approved', 'published'],
    })
      .notNull()
      .default('draft'),
    changes: jsonb('changes').$type<content.ContentChange[]>().notNull().default([]),
    issues: jsonb('issues').$type<content.ContentIssue[]>().notNull().default([]),
    baseVersion: text('base_version'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    publishedVersion: integer('published_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('drafts_author_idx').on(t.authorId, t.updatedAt),
    index('drafts_status_idx').on(t.status, t.updatedAt),
  ],
);

/** What happened to a draft and who did it; review comments live here. */
export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id'),
    actorName: text('actor_name').notNull(),
    action: text('action', {
      enum: [
        'created',
        'edited',
        'submitted',
        'withdrawn',
        'approved',
        'changes_requested',
        'published',
        'publish_failed',
      ],
    }).notNull(),
    comment: text('comment'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_draft_idx').on(t.draftId, t.at)],
);

/** Read model: the live curriculum, kept current from content events, to validate drafts. */
export const snapshot = pgTable('content_snapshot', {
  id: smallint('id').primaryKey().default(1),
  versionId: uuid('version_id').notNull(),
  number: integer('number').notNull(),
  bundle: jsonb('bundle').$type<ContentBundle>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
