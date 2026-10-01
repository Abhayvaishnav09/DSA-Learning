import { z } from 'zod';

/**
 * Content types (docs/06-content-system.md). Every learner-facing string is a LocalizedText,
 * so a missing translation fails validation instead of reaching a learner.
 */

export const LOCALES = ['en', 'hi-Latn'] as const;
export type Locale = (typeof LOCALES)[number];

export const LocalizedText = z.strictObject({
  en: z.string().trim().min(1),
  'hi-Latn': z.string().trim().min(1),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

const Id = z
  .string()
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'use lowercase words joined by . or -');

// ---------- graph ----------

export const Stage = z.strictObject({
  id: z.number().int().min(0),
  title: LocalizedText,
});
export type Stage = z.infer<typeof Stage>;

export const GraphConcept = z.strictObject({
  id: Id,
  stage: z.number().int().min(0),
  title: LocalizedText,
  prerequisites: z.array(Id).default([]),
});
export type GraphConcept = z.infer<typeof GraphConcept>;

export const Graph = z.strictObject({
  stages: z.array(Stage).min(1),
  concepts: z.array(GraphConcept).min(1),
});
export type Graph = z.infer<typeof Graph>;

export const Misconception = z.strictObject({
  id: Id,
  title: LocalizedText,
  explanation: LocalizedText,
});
export type Misconception = z.infer<typeof Misconception>;

export const Misconceptions = z.strictObject({ misconceptions: z.array(Misconception) });

// ---------- items ----------

const WrongAnswer = <T extends z.ZodType>(match: T) => z.strictObject({ match, misconception: Id });

const ExplainWhy = z.strictObject({
  question: LocalizedText,
  options: z
    .array(z.strictObject({ text: LocalizedText, correct: z.boolean().default(false) }))
    .min(2)
    .refine(
      (options) => options.filter((o) => o.correct).length === 1,
      'exactly one option must be correct',
    ),
});

const ItemBase = {
  id: Id,
  concept: Id,
  difficulty: z.number().int().min(1).max(5),
  /** An item testing the same logic with a different surface; used in reviews. */
  variationOf: Id.optional(),
  prompt: LocalizedText,
  /** Beginner pseudocode shown with the question (ADR-0009). */
  code: z.string().min(1).optional(),
  hints: z.array(LocalizedText).min(1).max(3),
  explanation: LocalizedText,
  explainWhy: ExplainWhy.optional(),
  estSeconds: z.number().int().min(5).max(600),
};

export const McqItem = z.strictObject({
  ...ItemBase,
  type: z.literal('mcq'),
  options: z
    .array(
      z.strictObject({
        text: LocalizedText,
        correct: z.boolean().default(false),
        misconception: Id.optional(),
      }),
    )
    .min(2)
    .max(5)
    .refine(
      (options) => options.filter((o) => o.correct).length === 1,
      'exactly one option must be correct',
    ),
});

export const PredictOutputItem = z.strictObject({
  ...ItemBase,
  type: z.literal('predict-output'),
  code: z.string().min(1),
  /** "last": the last thing shown. "all": everything shown, in order. */
  ask: z.enum(['last', 'all']),
  answer: z.string().min(1),
  wrongAnswers: z.array(WrongAnswer(z.string().min(1))).default([]),
});

export const ArrangeStepsItem = z.strictObject({
  ...ItemBase,
  type: z.literal('arrange-steps'),
  /** Program lines in the correct order, indentation included. Shown shuffled. */
  lines: z.array(z.string().min(1)).min(2).max(10),
  /** What the arranged program must show. Any order that runs and shows this is accepted. */
  expectedOutput: z.array(z.string()),
});

export const FillBlankItem = z.strictObject({
  ...ItemBase,
  type: z.literal('fill-blank'),
  /** Program with one `___` per blank. */
  code: z.string().includes('___'),
  blanks: z
    .array(
      z.strictObject({
        accept: z.array(z.string().min(1)).min(1),
        wrongAnswers: z.array(WrongAnswer(z.string().min(1))).default([]),
      }),
    )
    .min(1),
  /** Any fill that runs and shows exactly this is also accepted. */
  expectedOutput: z.array(z.string()),
});

export const TraceTableItem = z.strictObject({
  ...ItemBase,
  type: z.literal('trace-table'),
  code: z.string().min(1),
  /** A row is recorded every time this line finishes. */
  line: z.number().int().min(1),
  columns: z.array(z.string().min(1)).min(1).max(5),
  rows: z.array(z.array(z.string())).min(1).max(10),
  /** Cells shown already filled in, as [row, column]. */
  given: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).default([]),
  wrongAnswers: z.array(WrongAnswer(z.array(z.array(z.string())))).default([]),
});

export const Item = z.discriminatedUnion('type', [
  McqItem,
  PredictOutputItem,
  ArrangeStepsItem,
  FillBlankItem,
  TraceTableItem,
]);
export type Item = z.infer<typeof Item>;
export type ItemType = Item['type'];
export type ItemOf<T extends ItemType> = Extract<Item, { type: T }>;

// ---------- lessons ----------

export const Lesson = z.strictObject({
  concept: Id,
  minutes: z.number().int().min(1).max(15),
  story: z.strictObject({
    title: LocalizedText,
    body: z.array(LocalizedText).min(1).max(5),
    /** At most three new words per lesson (docs/01-learning-science.md §1). */
    terms: z.array(z.strictObject({ term: LocalizedText, meaning: LocalizedText })).max(3),
  }),
  see: z.strictObject({
    intro: LocalizedText,
    code: z.string().min(1),
    /** Author captions that replace the automatic ones, by frame index. */
    captions: z.record(z.string().regex(/^\d+$/), LocalizedText).default({}),
  }),
  predict: z.strictObject({
    intro: LocalizedText,
    /** The animation of `see.code` pauses on this frame while the learner predicts. */
    pauseAt: z.number().int().min(0),
    item: Id,
  }),
  practice: z.array(Id).min(1).max(8),
  recap: z.array(LocalizedText).min(1).max(5),
});
export type Lesson = z.infer<typeof Lesson>;

// ---------- bundle ----------

export interface BundleConcept extends GraphConcept {
  published: boolean;
}

/** The compiled, validated content shipped to the app (docs/06-content-system.md §4). */
export interface ContentBundle {
  version: string;
  stages: Stage[];
  concepts: BundleConcept[];
  misconceptions: Record<string, Misconception>;
  lessons: Record<string, Lesson>;
  items: Record<string, Item>;
}
