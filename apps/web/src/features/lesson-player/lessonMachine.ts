import { assign, setup } from 'xstate';
import type { LessonBeat } from '@/entities/progress/store';

/**
 * The six-beat lesson loop (docs/01-learning-science.md §1). "Explain" happens inside each
 * practice item; "Recall" happens days later in reviews.
 */

export const BEATS = [
  'story',
  'see',
  'predict',
  'practice',
  'recap',
] as const satisfies readonly LessonBeat[];

interface LessonContext {
  practiceIndex: number;
  practiceCount: number;
  resumeBeat: LessonBeat;
}

export type LessonEvent = { type: 'NEXT' } | { type: 'BACK' } | { type: 'ITEM_DONE' };

export interface LessonInput {
  practiceCount: number;
  /** Where the learner left off, so a refresh or app switch resumes on the same beat. */
  resume?: { beat: LessonBeat; practiceIndex: number };
}

export const lessonMachine = setup({
  types: {
    context: {} as LessonContext,
    events: {} as LessonEvent,
    input: {} as LessonInput,
  },
  guards: {
    resumeAt: ({ context }, params: { beat: LessonBeat }) => context.resumeBeat === params.beat,
    isLastItem: ({ context }) => context.practiceIndex >= context.practiceCount - 1,
  },
}).createMachine({
  id: 'lesson',
  context: ({ input }) => ({
    practiceCount: input.practiceCount,
    practiceIndex: Math.max(0, Math.min(input.resume?.practiceIndex ?? 0, input.practiceCount - 1)),
    resumeBeat: input.resume?.beat ?? 'story',
  }),
  initial: 'resuming',
  states: {
    resuming: {
      always: [
        { guard: { type: 'resumeAt', params: { beat: 'see' } }, target: 'see' },
        { guard: { type: 'resumeAt', params: { beat: 'predict' } }, target: 'predict' },
        { guard: { type: 'resumeAt', params: { beat: 'practice' } }, target: 'practice' },
        { target: 'story' },
      ],
    },
    story: { on: { NEXT: 'see' } },
    see: { on: { NEXT: 'predict', BACK: 'story' } },
    predict: {
      on: { NEXT: { target: 'practice', actions: assign({ practiceIndex: 0 }) }, BACK: 'see' },
    },
    practice: {
      on: {
        ITEM_DONE: [
          { guard: 'isLastItem', target: 'recap' },
          { actions: assign({ practiceIndex: ({ context }) => context.practiceIndex + 1 }) },
        ],
      },
    },
    recap: { type: 'final' },
  },
});
