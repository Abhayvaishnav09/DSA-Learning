import type { Item } from '@logicpath/content-schema';
import type { learning } from '@logicpath/contracts';
import { DAILY_GOAL_XP, STREAK_MILESTONES, xpForAttempt } from '@logicpath/gamification-rules';
import { grade, gradeExplain, type Verdict } from '@logicpath/grader';
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
}

export interface AttemptOutcome {
  state: LearnerState;
  result: Omit<learning.AttemptResult, 'attemptId' | 'duplicate'>;
  xp: XpEvent[];
  /** The learner finished this question (a right answer, or the answer was shown). */
  concluded: boolean;
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
  const { item, now, timeZone } = ctx;
  const at = new Date(Math.min(Date.parse(request.at), now.getTime() + MAX_CLOCK_SKEW_MS));
  const day = localDate(at, timeZone);
  if (item.type !== request.answer.type) {
    throw new InvalidAnswerError(item.id, item.type, request.answer.type);
  }
  const verdict: Verdict = grade(item, request.answer as never);
  const explained =
    request.explainOption === null ? null : gradeExplain(item, request.explainOption);
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
          correct: verdict.correct,
          hintLevel,
          guessProbability: verdict.guessProbability,
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
      (verdict.correct && (request.explainOption !== null || !item.explainWhy)));
  if (concluded) {
    const key = cardKey(item);
    const card = state.cards[key] ?? newCard(key, at);
    // An attempt that arrives after a newer review of the same card is history, not a new review.
    const stale = card.lastReview !== null && at.getTime() <= Date.parse(card.lastReview);
    const review = request.solutionShown
      ? 'again'
      : gradeFromAttempt({
          correct: verdict.correct && request.attemptNo === 1,
          hintLevel: request.hintLevel,
          durationMs: request.durationMs,
          expectedMs: item.estSeconds * 1000,
        });
    if (!stale) next.cards = { ...state.cards, [key]: scheduleReview(card, review, at) };
  }

  const minutes = Math.min(MAX_MINUTES_PER_ATTEMPT, request.durationMs / 60_000);
  next.days = addToDay(state.days, day, { minutes, items: concluded ? 1 : 0 });
  const streak = nextStreak(state.streak, day);
  next.streak = streak;

  const stats = { ...state.stats };
  if (verdict.correct && !predict && !request.solutionShown) {
    stats.correctTotal += 1;
    stats.unaidedRun = request.hintLevel === 0 ? stats.unaidedRun + 1 : 0;
    if (request.source === 'review') stats.reviewsDone += 1;
  } else if (!predict && !verdict.correct) {
    stats.unaidedRun = 0;
  }
  if (masteredNow) stats.conceptsMastered += 1;
  stats.longestStreak = Math.max(stats.longestStreak, streak.longest);
  next.stats = stats;

  const xp: XpEvent[] = [];
  const attemptXp = xpForAttempt({
    correct: verdict.correct,
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
      correct: verdict.correct,
      misconception: verdict.misconception,
      parts: verdict.parts,
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
    masteredNow,
  };
}
