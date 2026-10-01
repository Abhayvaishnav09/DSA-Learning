import { and, assign, setup } from 'xstate';

/**
 * One question's flow (docs/01-learning-science.md §6):
 * answer → (wrong: feedback, hints, retry) → right → explain why → done.
 * The full answer unlocks only after effort: three wrong tries, or every hint plus one wrong try.
 */

export type ItemMode = 'practice' | 'predict';

export interface ItemContext {
  mode: ItemMode;
  hintCount: number;
  hasExplain: boolean;
  hintLevel: number;
  wrongCount: number;
  firstTryCorrect: boolean | null;
  lastCorrect: boolean | null;
  explainedCorrectly: boolean | null;
  solutionShown: boolean;
}

export type ItemEvent =
  | { type: 'SUBMIT'; correct: boolean }
  | { type: 'HINT' }
  | { type: 'SHOW_SOLUTION' }
  | { type: 'EXPLAIN'; correct: boolean };

export interface ItemInput {
  mode: ItemMode;
  hintCount: number;
  hasExplain: boolean;
}

export const WRONG_TRIES_BEFORE_SOLUTION = 3;

export const canShowSolution = (c: ItemContext): boolean =>
  c.mode === 'practice' &&
  (c.wrongCount >= WRONG_TRIES_BEFORE_SOLUTION ||
    (c.hintLevel >= c.hintCount && c.wrongCount >= 1));

export const itemMachine = setup({
  types: {
    context: {} as ItemContext,
    events: {} as ItemEvent,
    input: {} as ItemInput,
  },
  guards: {
    isPredict: ({ context }) => context.mode === 'predict',
    isCorrect: ({ event }) => event.type === 'SUBMIT' && event.correct,
    needsExplain: ({ context }) => context.hasExplain,
    canHint: ({ context }) => context.mode === 'practice' && context.hintLevel < context.hintCount,
    canShowSolution: ({ context }) => canShowSolution(context),
  },
  actions: {
    recordSubmit: assign(({ context, event }) => {
      const correct = event.type === 'SUBMIT' && event.correct;
      return {
        firstTryCorrect: context.firstTryCorrect ?? correct,
        wrongCount: context.wrongCount + (correct ? 0 : 1),
        lastCorrect: correct,
      };
    }),
  },
}).createMachine({
  id: 'item',
  context: ({ input }) => ({
    ...input,
    hintLevel: 0,
    wrongCount: 0,
    firstTryCorrect: null,
    lastCorrect: null,
    explainedCorrectly: null,
    solutionShown: false,
  }),
  initial: 'answering',
  states: {
    answering: {
      on: {
        HINT: {
          guard: 'canHint',
          actions: assign({ hintLevel: ({ context }) => context.hintLevel + 1 }),
        },
        SUBMIT: [
          // A prediction gets one go: the animation then shows what really happens.
          { guard: 'isPredict', target: 'done', actions: 'recordSubmit' },
          {
            guard: and(['isCorrect', 'needsExplain']),
            target: 'explaining',
            actions: 'recordSubmit',
          },
          { guard: 'isCorrect', target: 'done', actions: 'recordSubmit' },
          { actions: 'recordSubmit' },
        ],
        SHOW_SOLUTION: {
          guard: 'canShowSolution',
          target: 'done',
          actions: assign({ solutionShown: true }),
        },
      },
    },
    explaining: {
      on: {
        EXPLAIN: {
          target: 'done',
          actions: assign({ explainedCorrectly: ({ event }) => event.correct }),
        },
      },
    },
    done: { type: 'final' },
  },
});
