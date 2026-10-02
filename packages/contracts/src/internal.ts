import { z } from 'zod';
import { XpPart } from './events';
import { IsoDateTime } from './common';
import * as learning from './http/learning';

/**
 * Calls between services on the private network (never through the gateway). Their shapes live
 * here so the two sides cannot drift apart, like the public endpoint table.
 */

/** What grading decided about one answer (practice grades; progress applies it). */
export const Graded = z.object({
  correct: z.boolean(),
  misconception: z.string().nullable(),
  parts: z.union([z.array(z.boolean()), z.array(z.array(z.boolean()))]).nullable(),
  guessProbability: z.number(),
  explainedCorrectly: z.boolean().nullable(),
});
export type Graded = z.infer<typeof Graded>;

/** practice → progress: apply one graded answer to a learner. */
export const ApplyAttempt = z.object({ request: learning.AttemptRequest, graded: Graded });
export type ApplyAttempt = z.infer<typeof ApplyAttempt>;

/** A question the learner finished: what the review schedule needs (becomes `practice.item.completed`). */
export const ItemCompletion = z.object({
  cardId: z.string(),
  firstTryCorrect: z.boolean(),
  hintLevel: z.number().int(),
  durationMs: z.number().int(),
  expectedMs: z.number().int(),
  solutionShown: z.boolean(),
  at: IsoDateTime,
});

/** progress → practice: what the answer did. */
export const AppliedAttempt = z.object({
  /** True when this attempt id had already been applied (a retry); nothing changed. */
  duplicate: z.boolean(),
  result: learning.AttemptResult.omit({ attemptId: true, duplicate: true }),
  xp: z.array(XpPart),
  concluded: z.boolean(),
  completion: ItemCompletion.nullable(),
  masteredNow: z.boolean(),
});
export type AppliedAttempt = z.infer<typeof AppliedAttempt>;
