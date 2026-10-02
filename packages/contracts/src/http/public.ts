import { z } from 'zod';

/**
 * The public curriculum API for outside developers (ADR-0021): read-only, API-key based,
 * answer keys removed so it can't be used to cheat.
 */

const Text = z.object({ en: z.string(), 'hi-Latn': z.string() });

export const PublicConcept = z
  .object({
    id: z.string(),
    stage: z.number().int(),
    title: Text,
    prerequisites: z.array(z.string()),
    published: z.boolean(),
  })
  .meta({ id: 'PublicConcept' });

export const PublicCurriculum = z
  .object({
    version: z.string(),
    stages: z.array(z.object({ id: z.number().int(), title: Text })),
    concepts: z.array(PublicConcept),
  })
  .meta({ id: 'PublicCurriculum' });

export const PublicLesson = z
  .object({
    concept: PublicConcept,
    minutes: z.number().int(),
    story: z.object({ title: Text, body: z.array(Text) }),
    code: z.string().describe('The example program shown step by step'),
    recap: z.array(Text),
    itemCount: z.number().int(),
  })
  .meta({ id: 'PublicLesson' });

export const PublicItem = z
  .object({
    id: z.string(),
    conceptId: z.string(),
    type: z.string(),
    difficulty: z.number().int(),
    prompt: Text,
    code: z.string().nullable(),
  })
  .meta({ id: 'PublicItem' });

export const PublicItemList = z
  .object({ items: z.array(PublicItem) })
  .meta({ id: 'PublicItemList' });

// Types for every schema above.
export type PublicConcept = z.infer<typeof PublicConcept>;
export type PublicCurriculum = z.infer<typeof PublicCurriculum>;
export type PublicLesson = z.infer<typeof PublicLesson>;
export type PublicItem = z.infer<typeof PublicItem>;
export type PublicItemList = z.infer<typeof PublicItemList>;
