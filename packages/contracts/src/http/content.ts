import {
  GraphConcept,
  Item,
  Lesson,
  LocalizedText,
  Misconception,
  Stage,
} from '@logicpath/content-schema';
import { z } from 'zod';
import { Id, IsoDateTime } from '../common';

/** The published curriculum, compiled and validated (docs/06-content-system.md §4). */

export const LessonVisual = z
  .object({
    frames: z
      .array(z.unknown())
      .describe(
        'Interpreter frames for the lesson\'s "see" code (see the visualizer engine Frame)',
      ),
    captions: z.object({ en: z.array(z.string()), 'hi-Latn': z.array(z.string()) }),
  })
  .meta({ id: 'LessonVisual' });

export const Bundle = z
  .object({
    version: z.string().describe('Content hash; changes whenever the curriculum changes'),
    stages: z.array(Stage),
    concepts: z.array(GraphConcept.extend({ published: z.boolean() })),
    misconceptions: z.record(z.string(), Misconception),
    lessons: z.record(z.string(), Lesson),
    items: z.record(z.string(), Item),
    visuals: z.record(z.string(), LessonVisual).optional(),
  })
  .meta({ id: 'ContentBundle' });
export type Bundle = z.infer<typeof Bundle>;

export const Manifest = z
  .object({
    versionId: Id,
    number: z.number().int().describe('Increases by one on every publish or rollback'),
    checksum: z.string().describe('Same as the bundle version and ETag'),
    publishedAt: IsoDateTime,
    concepts: z.number().int(),
    items: z.number().int(),
  })
  .meta({ id: 'ContentManifest' });
export type Manifest = z.infer<typeof Manifest>;

export const Version = z
  .object({
    id: Id,
    number: z.number().int(),
    checksum: z.string(),
    note: z.string(),
    submissionId: Id.nullable(),
    publishedBy: Id.nullable(),
    publishedAt: IsoDateTime,
    current: z.boolean(),
  })
  .meta({ id: 'ContentVersion' });
export type Version = z.infer<typeof Version>;

export const VersionPage = z
  .object({ items: z.array(Version), nextCursor: z.string().nullable() })
  .meta({ id: 'ContentVersionPage' });

export const RollbackRequest = z
  .object({ note: z.string().trim().min(1).max(500).optional() })
  .meta({ id: 'RollbackRequest' });

// ---------- changes a writer proposes ----------

const changeTarget = (c: { kind: string; data: { id: string } | { concept: string } }) =>
  c.kind === 'lesson' ? (c.data as { concept: string }).concept : (c.data as { id: string }).id;

const ChangeKind = z.enum(['concept', 'lesson', 'item', 'misconception']);

export const ContentChange = z
  .union([
    z.object({
      kind: z.literal('concept'),
      op: z.literal('upsert'),
      id: z.string(),
      data: GraphConcept,
    }),
    z.object({ kind: z.literal('lesson'), op: z.literal('upsert'), id: z.string(), data: Lesson }),
    z.object({ kind: z.literal('item'), op: z.literal('upsert'), id: z.string(), data: Item }),
    z.object({
      kind: z.literal('misconception'),
      op: z.literal('upsert'),
      id: z.string(),
      data: Misconception,
    }),
    z.object({ kind: ChangeKind, op: z.literal('delete'), id: z.string() }),
  ])
  .refine((c) => c.op === 'delete' || changeTarget(c) === c.id, {
    message: 'id must match the id inside data (for a lesson, its concept)',
  })
  .meta({ id: 'ContentChange' });
export type ContentChange = z.infer<typeof ContentChange>;

export const ContentIssue = z
  .object({
    file: z.string().describe('Where the problem is, as a path in the YAML content tree'),
    message: z.string(),
    severity: z.enum(['error', 'warning']),
  })
  .meta({ id: 'ContentIssue' });
export type ContentIssue = z.infer<typeof ContentIssue>;

export { LocalizedText };

// Types for every schema above.
export type LessonVisual = z.infer<typeof LessonVisual>;
export type VersionPage = z.infer<typeof VersionPage>;
export type RollbackRequest = z.infer<typeof RollbackRequest>;
