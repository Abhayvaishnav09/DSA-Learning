import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';

/**
 * Spaced repetition with FSRS (docs/01-learning-science.md §4, ADR-0005).
 * Cards are plain JSON so they can live in local storage now and in Postgres later.
 */

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface ReviewCard {
  itemId: string;
  due: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: string | null;
}

export const TARGET_RETENTION = 0.9;
export const DAILY_REVIEW_CAP = 20;

// Short-term (minute) steps are off: lessons already give same-session practice, so reviews start a day later.
const scheduler = fsrs({
  request_retention: TARGET_RETENTION,
  enable_fuzz: false,
  enable_short_term: false,
});

const RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_NAME: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const STATE_VALUE: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function toCard(card: ReviewCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_VALUE[card.state],
    ...(card.lastReview ? { last_review: new Date(card.lastReview) } : {}),
  };
}

function fromCard(itemId: string, card: Card): ReviewCard {
  return {
    itemId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAME[card.state],
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function newCard(itemId: string, now: Date): ReviewCard {
  return fromCard(itemId, createEmptyCard(now));
}

export function scheduleReview(card: ReviewCard, grade: ReviewGrade, now: Date): ReviewCard {
  const { card: next } = scheduler.next(toCard(card), now, RATING[grade]);
  return fromCard(card.itemId, next);
}

export interface GradeInput {
  correct: boolean;
  hintLevel: number;
  durationMs: number;
  /** Authored estimate for the item. */
  expectedMs: number;
}

/** Maps an attempt to an FSRS grade: wrong → again, hinted → hard, fast → easy, else good. */
export function gradeFromAttempt({
  correct,
  hintLevel,
  durationMs,
  expectedMs,
}: GradeInput): ReviewGrade {
  if (!correct) return 'again';
  if (hintLevel > 0) return 'hard';
  if (durationMs <= expectedMs / 2) return 'easy';
  return 'good';
}

/** Cards due at `now`, most overdue first, capped so reviews never crowd out new learning. */
export function dueCards(
  cards: Iterable<ReviewCard>,
  now: Date,
  cap: number = DAILY_REVIEW_CAP,
): ReviewCard[] {
  const nowIso = now.toISOString();
  return [...cards]
    .filter((card) => card.due <= nowIso)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, cap);
}

export function nextDue(cards: Iterable<ReviewCard>): string | null {
  let earliest: string | null = null;
  for (const card of cards) {
    if (earliest === null || card.due < earliest) earliest = card.due;
  }
  return earliest;
}
