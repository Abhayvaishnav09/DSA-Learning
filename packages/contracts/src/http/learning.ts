import { z } from 'zod';
import { Id, IsoDateTime, LocalDate } from '../common';

/** Practice, progress and review: what a learner does and how far they are (docs/04-backend.md). */

// ---------- practice ----------

const TruthValue = z.enum(['true', 'false']);

/** A learner's answer; mirrors the grader's `Answer` type (checked by a type test). */
export const Answer = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('mcq'), option: z.number().int().min(0) }),
    z.object({ type: z.literal('predict-output'), text: z.string().max(500) }),
    z.object({ type: z.literal('arrange-steps'), order: z.array(z.number().int().min(0)).max(10) }),
    z.object({ type: z.literal('fill-blank'), blanks: z.array(z.string().max(200)).max(10) }),
    z.object({
      type: z.literal('trace-table'),
      rows: z.array(z.array(z.string().max(50))).max(10),
    }),
    z.object({ type: z.literal('truth-table'), rows: z.array(z.array(TruthValue)).max(8) }),
  ])
  .meta({ id: 'Answer' });
export type Answer = z.infer<typeof Answer>;

export const AttemptSource = z.enum(['lesson', 'predict', 'review']);

export const AttemptRequest = z
  .object({
    id: Id.describe('Client-generated; resending the same id is safe (idempotent)'),
    itemId: z.string(),
    answer: Answer,
    hintLevel: z.number().int().min(0).max(3),
    durationMs: z.number().int().min(0).max(3_600_000),
    source: AttemptSource,
    explainOption: z
      .number()
      .int()
      .min(0)
      .nullable()
      .default(null)
      .describe('The "why" option picked after a correct answer'),
    solutionShown: z.boolean().default(false),
    attemptNo: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe(
        'Which try this is for the item in this sitting; a first-try answer schedules reviews further out',
      ),
    at: IsoDateTime.describe('When it happened on the device (offline attempts sync later)'),
  })
  .meta({ id: 'AttemptRequest' });
export type AttemptRequest = z.infer<typeof AttemptRequest>;

export const ConceptStatus = z.enum(['locked', 'available', 'learning', 'mastered']);

export const AttemptResult = z
  .object({
    attemptId: Id,
    correct: z.boolean(),
    misconception: z.string().nullable(),
    parts: z.union([z.array(z.boolean()), z.array(z.array(z.boolean()))]).nullable(),
    explainedCorrectly: z.boolean().nullable(),
    xpAwarded: z.number().int(),
    concept: z.object({ conceptId: z.string(), pKnown: z.number(), status: ConceptStatus }),
    duplicate: z.boolean().describe('true when this attempt id was already recorded'),
  })
  .meta({ id: 'AttemptResult' });
export type AttemptResult = z.infer<typeof AttemptResult>;

export const SyncRequest = z
  .object({ attempts: z.array(AttemptRequest).min(1).max(100) })
  .meta({ id: 'SyncRequest' });
export const SyncResult = z.object({ results: z.array(AttemptResult) }).meta({ id: 'SyncResult' });

// ---------- progress ----------

export const LessonBeat = z.enum(['story', 'see', 'predict', 'practice', 'recap']);

export const ConceptProgress = z
  .object({
    conceptId: z.string(),
    status: ConceptStatus,
    pKnown: z.number(),
    attempts: z.number().int(),
    masteredAt: IsoDateTime.nullable(),
  })
  .meta({ id: 'ConceptProgress' });

export const LessonState = z
  .object({
    conceptId: z.string(),
    beat: LessonBeat,
    practiceIndex: z.number().int().min(0),
    startedAt: IsoDateTime,
    completedAt: IsoDateTime.nullable(),
  })
  .meta({ id: 'LessonState' });
export type LessonState = z.infer<typeof LessonState>;

export const Streak = z
  .object({
    current: z.number().int(),
    longest: z.number().int(),
    lastActiveOn: LocalDate.nullable(),
  })
  .meta({ id: 'Streak' });

export const Today = z
  .object({
    localDate: LocalDate,
    minutes: z.number(),
    goalMinutes: z.number().int(),
    itemsCompleted: z.number().int(),
    lessonsCompleted: z.number().int(),
  })
  .meta({ id: 'Today' });

export const ProgressMap = z
  .object({
    contentVersion: z.number().int(),
    concepts: z.array(ConceptProgress),
    lessons: z.array(LessonState),
    streak: Streak,
    today: Today,
  })
  .meta({ id: 'ProgressMap' });
export type ProgressMap = z.infer<typeof ProgressMap>;

/**
 * The learner's whole learning state, in the shape the apps' own engine (learning-engine) keeps
 * on the device. A new device downloads it, so progress follows the person, not the phone.
 */
export const EngineState = z
  .object({
    concepts: z.record(
      z.string(),
      z.object({
        conceptId: z.string(),
        pKnown: z.number(),
        attempts: z.number().int(),
        correct: z.number().int(),
        firstPracticedOn: LocalDate,
        recallPassedOn: LocalDate.nullable(),
      }),
    ),
    cards: z.record(
      z.string(),
      z.object({
        itemId: z.string(),
        due: IsoDateTime,
        stability: z.number(),
        difficulty: z.number(),
        scheduledDays: z.number(),
        learningSteps: z.number().int(),
        reps: z.number().int(),
        lapses: z.number().int(),
        state: z.enum(['new', 'learning', 'review', 'relearning']),
        lastReview: IsoDateTime.nullable(),
      }),
    ),
    lessons: z.record(z.string(), LessonState),
    streak: Streak,
    masteredAt: z.record(z.string(), IsoDateTime),
  })
  .meta({ id: 'EngineState' });
export type EngineState = z.infer<typeof EngineState>;

export const LessonPosition = z
  .object({ beat: LessonBeat, practiceIndex: z.number().int().min(0).default(0) })
  .meta({ id: 'LessonPosition' });

// ---------- review ----------

export const DueCard = z
  .object({
    cardId: z.string(),
    itemId: z.string(),
    conceptId: z.string(),
    due: IsoDateTime,
    state: z.enum(['new', 'learning', 'review', 'relearning']),
    reps: z.number().int(),
    lapses: z.number().int(),
  })
  .meta({ id: 'DueCard' });

export const DueQueue = z
  .object({
    items: z.array(DueCard),
    dueCount: z.number().int(),
    nextDueAt: IsoDateTime.nullable(),
  })
  .meta({ id: 'DueQueue' });
export type DueQueue = z.infer<typeof DueQueue>;

export const ReviewSummary = z
  .object({
    dueNow: z.number().int(),
    dueToday: z.number().int(),
    total: z.number().int(),
    nextDueAt: IsoDateTime.nullable(),
  })
  .meta({ id: 'ReviewSummary' });
export type ReviewSummary = z.infer<typeof ReviewSummary>;

// Types for every schema above.
export type AttemptSource = z.infer<typeof AttemptSource>;
export type ConceptStatus = z.infer<typeof ConceptStatus>;
export type SyncRequest = z.infer<typeof SyncRequest>;
export type SyncResult = z.infer<typeof SyncResult>;
export type LessonBeat = z.infer<typeof LessonBeat>;
export type ConceptProgress = z.infer<typeof ConceptProgress>;
export type Streak = z.infer<typeof Streak>;
export type Today = z.infer<typeof Today>;
export type LessonPosition = z.infer<typeof LessonPosition>;
export type DueCard = z.infer<typeof DueCard>;
