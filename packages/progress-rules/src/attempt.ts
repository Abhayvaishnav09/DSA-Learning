import type { Item } from '@logicpath/content-schema';
import type { learning } from '@logicpath/contracts';
import {
  DAILY_GOAL_XP,
  STREAK_MILESTONES,
  statsAfterAttempt,
  xpForAttempt,
} from '@logicpath/gamification-rules';
import { grade, gradeExplain } from '@logicpath/grader';
import {
  applyAttempt,
  conceptStatus,
  gradeFromAttempt,
  isMastered,
  localDate,
  newCard,
  scheduleReview,
  type GraphConcept,
  type HintLevel,
  type ReviewCard,
} from '@logicpath/learning-engine';
import { addToDay, nextStreak, type LearnerState } from './state';

export interface XpEvent {
  amount: number;
  reason: 'attempt' | 'daily-goal' | 'streak' | 'lesson';
}

export interface AttemptContext {
  item: Item;
  graph: ReadonlyMap<string, GraphConcept>;
  now: Date;
  timeZone: string;
  goalMinutes: number;
  /**
   * Whether this caller keeps the review cards. The apps and the demo do; on the servers the
   * review service owns the cards and `progress` only reports the completion (default true).
   */
  schedule?: boolean;
}

/** What grading decided about one answer. Practice grades it; progress applies it. */
export interface Graded {
  correct: boolean;
  misconception: string | null;
  parts: boolean[] | boolean[][] | null;
  guessProbability: number;
  /** null when the learner did not pick a "why" option. */
  explainedCorrectly: boolean | null;
}

/** A question the learner finished: what the review schedule needs to move its card. */
export interface ItemCompletion {
  cardId: string;
  firstTryCorrect: boolean;
  hintLevel: number;
  durationMs: number;
  expectedMs: number;
  solutionShown: boolean;
  at: string;
}

export interface AttemptOutcome {
  state: LearnerState;
  result: Omit<learning.AttemptResult, 'attemptId' | 'duplicate'>;
  xp: XpEvent[];
  /** The learner finished this question (a right answer, or the answer was shown). */
  concluded: boolean;
  /** Set when `concluded`: the input of the review schedule. */
  completion: ItemCompletion | null;
  masteredNow: boolean;
}

/** A device clock slightly ahead is fine; further ahead is treated as "now". */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** Time spent on one question counts up to this, so an open tab doesn't earn minutes. */
const MAX_MINUTES_PER_ATTEMPT = 5;

/** The answer is for a different kind of question than the item (a client bug or a tampered request). */
export class InvalidAnswerError extends Error {
  constructor(itemId: string, expected: string, got: string) {
    super(`${itemId} is a ${expected} question, but the answer is a ${got}`);
    this.name = 'InvalidAnswerError';
  }
}

export const cardKey = (item: Item): string => item.variationOf ?? item.id;

/** Checks the answer against the item (and the "why" pick). Throws for an answer of the wrong kind. */
export function gradeAttempt(item: Item, request: learning.AttemptRequest): Graded {
  if (item.type !== request.answer.type) {
    throw new InvalidAnswerError(item.id, item.type, request.answer.type);
  }
  const verdict = grade(item, request.answer as never);
  return {
    correct: verdict.correct,
    misconception: verdict.misconception,
    parts: verdict.parts,
    guessProbability: verdict.guessProbability,
    explainedCorrectly:
      request.explainOption === null ? null : gradeExplain(item, request.explainOption),
  };
}

/**
 * The review card after a finished question, or null when the completion is older than the
 * card's last review (an attempt synced late is history, not a new review).
 */
export function scheduleCompletion(
  existing: ReviewCard | undefined,
  completion: ItemCompletion,
): ReviewCard | null {
  const at = new Date(completion.at);
  const card = existing ?? newCard(completion.cardId, at);
  if (card.lastReview !== null && at.getTime() <= Date.parse(card.lastReview)) return null;
  const review = completion.solutionShown
    ? 'again'
    : gradeFromAttempt({
        correct: completion.firstTryCorrect,
        hintLevel: completion.hintLevel,
        durationMs: completion.durationMs,
        expectedMs: completion.expectedMs,
      });
  return scheduleReview(card, review, at);
}

/**
 * One attempt, graded and applied: the answer is checked against the item, mastery and review
 * schedule move, and XP is paid. Pure: the caller stores the new state, the attempt record and
 * its id (for idempotency).
 */
export function processAttempt(
  state: LearnerState,
  request: learning.AttemptRequest,
  ctx: AttemptContext,
): AttemptOutcome {
  return applyGraded(state, request, gradeAttempt(ctx.item, request), ctx);
}

/** The second half of `processAttempt`: what a graded answer does to the learner's state. */
export function applyGraded(
  state: LearnerState,
  request: learning.AttemptRequest,
  graded: Graded,
  ctx: AttemptContext,
): AttemptOutcome {
  const { item, now, timeZone } = ctx;
  const at = new Date(Math.min(Date.parse(request.at), now.getTime() + MAX_CLOCK_SKEW_MS));
  const day = localDate(at, timeZone);
  const explained = graded.explainedCorrectly;
  const predict = request.source === 'predict';
  const evidence = !predict && !request.solutionShown;
  const hintLevel = Math.min(3, request.hintLevel) as HintLevel;

  let next: LearnerState = { ...state };
  const wasMastered = isMastered(state.concepts[item.concept]);

  if (evidence) {
    next.concepts = {
      ...state.concepts,
      [item.concept]: applyAttempt(
        state.concepts[item.concept],
        {
          conceptId: item.concept,
          at,
          correct: graded.correct,
          hintLevel,
          guessProbability: graded.guessProbability,
          ...(explained === null ? {} : { explainedCorrectly: explained }),
        },
        { timeZone },
      ),
    };
  }
  const masteredNow = evidence && !wasMastered && isMastered(next.concepts[item.concept]);
  if (masteredNow) {
    next.masteredAt = { ...state.masteredAt, [item.concept]: at.toISOString() };
  }

  const concluded =
    !predict &&
    (request.solutionShown ||
      (graded.correct && (request.explainOption !== null || !item.explainWhy)));
  let completion: ItemCompletion | null = null;
  if (concluded) {
    completion = {
      cardId: cardKey(item),
      firstTryCorrect: graded.correct && request.attemptNo === 1,
      hintLevel: request.hintLevel,
      durationMs: request.durationMs,
      expectedMs: item.estSeconds * 1000,
      solutionShown: request.solutionShown,
      at: at.toISOString(),
    };
    if (ctx.schedule !== false) {
      const card = scheduleCompletion(state.cards[completion.cardId], completion);
      if (card) next.cards = { ...state.cards, [completion.cardId]: card };
    }
  }

  const minutes = Math.min(MAX_MINUTES_PER_ATTEMPT, request.durationMs / 60_000);
  next.days = addToDay(state.days, day, { minutes, items: concluded ? 1 : 0 });
  const streak = nextStreak(state.streak, day);
  next.streak = streak;

  const stats = statsAfterAttempt(state.stats, {
    correct: graded.correct,
    hintLevel: request.hintLevel,
    source: request.source,
    solutionShown: request.solutionShown,
  });
  if (masteredNow) stats.conceptsMastered += 1;
  stats.longestStreak = Math.max(stats.longestStreak, streak.longest);
  next.stats = stats;

  const xp: XpEvent[] = [];
  const attemptXp = xpForAttempt({
    correct: graded.correct,
    hintLevel: request.hintLevel,
    source: request.source,
    explainedCorrectly: explained,
    solutionShown: request.solutionShown,
  });
  if (attemptXp > 0) xp.push({ amount: attemptXp, reason: 'attempt' });

  const today = next.days[day]!;
  if (!today.goalPaid && today.minutes >= ctx.goalMinutes) {
    next.days = { ...next.days, [day]: { ...today, goalPaid: true } };
    xp.push({ amount: DAILY_GOAL_XP, reason: 'daily-goal' });
  }
  const milestone = STREAK_MILESTONES[streak.current];
  if (milestone && streak.current > state.streak.current) {
    xp.push({ amount: milestone, reason: 'streak' });
  }

  next = { ...next };
  return {
    state: next,
    result: {
      correct: graded.correct,
      misconception: graded.misconception,
      parts: graded.parts,
      explainedCorrectly: explained,
      xpAwarded: xp.reduce((sum, e) => sum + e.amount, 0),
      concept: {
        conceptId: item.concept,
        pKnown: next.concepts[item.concept]?.pKnown ?? 0,
        status: conceptStatus(
          ctx.graph.get(item.concept) ?? {
            id: item.concept,
            prerequisites: [],
            published: true,
          },
          next.concepts,
          ctx.graph,
        ),
      },
    },
    xp,
    concluded,
    completion,
    masteredNow,
  };
}
