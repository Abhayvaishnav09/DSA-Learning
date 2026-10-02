import { z } from 'zod';
import { Id, IsoDateTime } from '../common';
import { ContentChange, ContentIssue } from './content';

/** Writer drafts and the admin review workflow (ADR-0017). */

export const DRAFT_STATUSES = [
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
] as const;
export const DraftStatus = z.enum(DRAFT_STATUSES).meta({ id: 'DraftStatus' });
export type DraftStatus = z.infer<typeof DraftStatus>;

export const Activity = z
  .object({
    id: Id,
    actorId: Id.nullable().describe('null when the system acted (publish succeeded or failed)'),
    actorName: z.string(),
    action: z.enum([
      'created',
      'edited',
      'submitted',
      'withdrawn',
      'approved',
      'changes_requested',
      'published',
      'publish_failed',
    ]),
    comment: z.string().nullable(),
    at: IsoDateTime,
  })
  .meta({ id: 'DraftActivity' });
export type Activity = z.infer<typeof Activity>;

export const DraftSummary = z
  .object({
    id: Id,
    title: z.string(),
    status: DraftStatus,
    authorId: Id,
    authorName: z.string(),
    changeCount: z.number().int(),
    updatedAt: IsoDateTime,
    submittedAt: IsoDateTime.nullable(),
    publishedVersion: z.number().int().nullable(),
  })
  .meta({ id: 'DraftSummary' });
export type DraftSummary = z.infer<typeof DraftSummary>;

export const Draft = DraftSummary.extend({
  changes: z.array(ContentChange),
  baseVersion: z.string().nullable().describe('Content version the draft was last validated on'),
  issues: z.array(ContentIssue).describe('Problems from the last validation or failed publish'),
  activity: z.array(Activity),
}).meta({ id: 'Draft' });
export type Draft = z.infer<typeof Draft>;

export const DraftPage = z
  .object({ items: z.array(DraftSummary), nextCursor: z.string().nullable() })
  .meta({ id: 'DraftPage' });

export const DraftQuery = z.object({
  status: DraftStatus.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateDraft = z
  .object({
    title: z.string().trim().min(3).max(120),
    changes: z.array(ContentChange).max(200).default([]),
  })
  .meta({ id: 'CreateDraft' });

export const UpdateDraft = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    changes: z.array(ContentChange).max(200).optional(),
  })
  .meta({ id: 'UpdateDraft' });

export const Validation = z
  .object({
    ok: z.boolean().describe('true when there are no errors (warnings are allowed)'),
    baseVersion: z.string(),
    issues: z.array(ContentIssue),
  })
  .meta({ id: 'DraftValidation' });
export type Validation = z.infer<typeof Validation>;

export const ReviewDecision = z
  .object({ comment: z.string().trim().max(2000).optional() })
  .meta({ id: 'ReviewDecision' });

export const RequestChanges = z
  .object({ comment: z.string().trim().min(1).max(2000) })
  .meta({ id: 'RequestChanges' });

/** What the content service fetches when a submission is approved (claim check). */
export const Submission = z.object({
  id: Id,
  title: z.string(),
  authorId: Id,
  changes: z.array(ContentChange),
});
export type Submission = z.infer<typeof Submission>;

// Types for every schema above.
export type DraftPage = z.infer<typeof DraftPage>;
export type DraftQuery = z.infer<typeof DraftQuery>;
export type CreateDraft = z.infer<typeof CreateDraft>;
export type UpdateDraft = z.infer<typeof UpdateDraft>;
export type ReviewDecision = z.infer<typeof ReviewDecision>;
export type RequestChanges = z.infer<typeof RequestChanges>;
