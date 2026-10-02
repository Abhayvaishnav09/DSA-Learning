import {
  applyAttempt,
  daysBetween,
  gradeFromAttempt,
  localDate,
  newCard,
  scheduleReview,
  type ConceptState,
  type HintLevel,
  type ReviewCard,
} from '@logicpath/learning-engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { learning } from '@logicpath/contracts';
import { learnerTimeZone, now } from '@/shared/lib/clock';
import { safeLocalStorage } from '@/shared/lib/storage';
import { enqueue } from '@/shared/sync/queue';

/**
 * Learner progress, kept on the device in R0 (guest mode). In R1 the same records sync to the
 * API with idempotency keys and the server becomes the source of truth (docs/02-architecture.md §6.1).
 */

export type AttemptSource = 'lesson' | 'predict' | 'review';

export interface AttemptRecord {
  id: string;
  itemId: string;
  conceptId: string;
  correct: boolean;
  hintLevel: HintLevel;
  misconception: string | null;
  durationMs: number;
  source: AttemptSource;
  at: string;
}

export type LessonBeat = 'story' | 'see' | 'predict' | 'practice' | 'recap';

export interface LessonProgress {
  beat: LessonBeat;
  practiceIndex: number;
  startedAt: string;
  completedAt: string | null;
}

export interface Streak {
  current: number;
  longest: number;
  lastActiveOn: string | null;
}

export interface AttemptInput {
  itemId: string;
  conceptId: string;
  correct: boolean;
  hintLevel: HintLevel;
  guessProbability: number;
  explainedCorrectly?: boolean;
  misconception: string | null;
  durationMs: number;
  source: AttemptSource;
  /** What the learner answered, sent to the server so it can grade it too. */
  answer: learning.AttemptRequest['answer'];
  /** The "why" option picked after a right answer. */
  explainOption?: number | null;
  /** Which try this is for the question in this sitting. */
  attemptNo?: number;
  solutionShown?: boolean;
}

export interface ItemOutcome {
  /** Review cards are keyed by the original item, so variations share one schedule. */
  cardId: string;
  firstTryCorrect: boolean;
  hintLevel: number;
  durationMs: number;
  expectedMs: number;
  solutionShown: boolean;
}

interface ProgressState {
  concepts: Record<string, ConceptState>;
  cards: Record<string, ReviewCard>;
  attempts: AttemptRecord[];
  lessons: Record<string, LessonProgress>;
  streak: Streak;
  recordAttempt: (input: AttemptInput) => void;
  /** Tells the server a solution was shown (no credit on the device). */
  recordSolutionShown: (input: AttemptInput) => void;
  /** Takes what the server knows (already merged with this device) as the new state. */
  importProgress: (
    progress: Pick<ProgressState, 'concepts' | 'cards' | 'lessons' | 'streak'>,
  ) => void;
  completeItem: (outcome: ItemOutcome) => ReviewCard;
  saveLessonPosition: (conceptId: string, beat: LessonBeat, practiceIndex: number) => void;
  completeLesson: (conceptId: string) => void;
  reset: () => void;
}

/** Local log is capped; R1 syncs it to the server and then trims. */
const MAX_LOCAL_ATTEMPTS = 1000;

const initial = {
  concepts: {},
  cards: {},
  attempts: [],
  lessons: {},
  streak: { current: 0, longest: 0, lastActiveOn: null },
} satisfies Pick<ProgressState, 'concepts' | 'cards' | 'attempts' | 'lessons' | 'streak'>;

export function nextStreak(streak: Streak, today: string): Streak {
  if (streak.lastActiveOn === today) return streak;
  const continues = streak.lastActiveOn !== null && daysBetween(streak.lastActiveOn, today) === 1;
  const current = continues ? streak.current + 1 : 1;
  return { current, longest: Math.max(streak.longest, current), lastActiveOn: today };
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function queueAttempt(input: AttemptInput, id: string, at: Date) {
  enqueue({
    kind: 'attempt',
    request: {
      id,
      itemId: input.itemId,
      answer: input.answer,
      hintLevel: input.hintLevel,
      durationMs: Math.min(3_600_000, Math.max(0, Math.round(input.durationMs))),
      source: input.source,
      explainOption: input.explainOption ?? null,
      solutionShown: input.solutionShown ?? false,
      attemptNo: input.attemptNo ?? 1,
      at: at.toISOString(),
    },
  });
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,

      recordSolutionShown: (input) => {
        queueAttempt({ ...input, solutionShown: true }, newId(), now());
      },

      importProgress: (progress) => set(progress),

      recordAttempt: (input) => {
        const at = now();
        const timeZone = learnerTimeZone();
        const attemptId = newId();
        queueAttempt(input, attemptId, at);
        set((state) => {
          const attempt: AttemptRecord = {
            id: attemptId,
            itemId: input.itemId,
            conceptId: input.conceptId,
            correct: input.correct,
            hintLevel: input.hintLevel,
            misconception: input.misconception,
            durationMs: input.durationMs,
            source: input.source,
            at: at.toISOString(),
          };
          // Predictions happen before teaching, so they don't count as evidence of knowledge.
          const concepts =
            input.source === 'predict'
              ? state.concepts
              : {
                  ...state.concepts,
                  [input.conceptId]: applyAttempt(
                    state.concepts[input.conceptId],
                    {
                      conceptId: input.conceptId,
                      at,
                      correct: input.correct,
                      hintLevel: input.hintLevel,
                      guessProbability: input.guessProbability,
                      ...(input.explainedCorrectly === undefined
                        ? {}
                        : { explainedCorrectly: input.explainedCorrectly }),
                    },
                    { timeZone },
                  ),
                };
          return {
            concepts,
            attempts: [...state.attempts, attempt].slice(-MAX_LOCAL_ATTEMPTS),
            streak: nextStreak(state.streak, localDate(at, timeZone)),
          };
        });
      },

      completeItem: (outcome) => {
        const at = now();
        const card = get().cards[outcome.cardId] ?? newCard(outcome.cardId, at);
        const grade = outcome.solutionShown
          ? 'again'
          : gradeFromAttempt({
              correct: outcome.firstTryCorrect,
              hintLevel: outcome.hintLevel,
              durationMs: outcome.durationMs,
              expectedMs: outcome.expectedMs,
            });
        const next = scheduleReview(card, grade, at);
        set((state) => ({ cards: { ...state.cards, [outcome.cardId]: next } }));
        return next;
      },

      saveLessonPosition: (conceptId, beat, practiceIndex) => {
        enqueue({ kind: 'position', conceptId, beat, practiceIndex });
        set((state) => {
          const existing = state.lessons[conceptId];
          return {
            lessons: {
              ...state.lessons,
              [conceptId]: {
                beat,
                practiceIndex,
                startedAt: existing?.startedAt ?? now().toISOString(),
                completedAt: existing?.completedAt ?? null,
              },
            },
          };
        });
      },

      completeLesson: (conceptId) => {
        enqueue({ kind: 'complete', conceptId });
        set((state) => {
          const existing = state.lessons[conceptId];
          const at = now().toISOString();
          return {
            lessons: {
              ...state.lessons,
              [conceptId]: {
                beat: 'recap',
                practiceIndex: 0,
                startedAt: existing?.startedAt ?? at,
                completedAt: at,
              },
            },
          };
        });
      },

      reset: () => set(initial),
    }),
    {
      name: 'logicpath:progress',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({ concepts, cards, attempts, lessons, streak }) => ({
        concepts,
        cards,
        attempts,
        lessons,
        streak,
      }),
    },
  ),
);
