import type { learning } from '@logicpath/contracts';
import type { ConceptState, ReviewCard } from '@logicpath/learning-engine';
import { describe, expect, it } from 'vitest';
import { mergeProgress, type DeviceProgress } from './merge';

const concept = (conceptId: string, attempts: number, pKnown = 0.5): ConceptState => ({
  conceptId,
  pKnown,
  attempts,
  correct: attempts,
  firstPracticedOn: '2026-10-01',
  recallPassedOn: null,
});
const card = (itemId: string, lastReview: string | null): ReviewCard => ({
  itemId,
  due: '2026-10-05T00:00:00.000Z',
  stability: 1,
  difficulty: 5,
  scheduledDays: 1,
  learningSteps: 0,
  reps: 1,
  lapses: 0,
  state: 'review',
  lastReview,
});
const empty: DeviceProgress = {
  concepts: {},
  cards: {},
  lessons: {},
  streak: { current: 0, longest: 0, lastActiveOn: null },
};
const serverEmpty: learning.EngineState = {
  concepts: {},
  cards: {},
  lessons: {},
  streak: { current: 0, longest: 0, lastActiveOn: null },
  masteredAt: {},
};

describe('mergeProgress', () => {
  it('takes the side that has seen more of a concept', () => {
    const merged = mergeProgress(
      { ...empty, concepts: { a: concept('a', 5), b: concept('b', 1) } },
      { ...serverEmpty, concepts: { a: concept('a', 3), b: concept('b', 4), c: concept('c', 1) } },
    );
    expect(
      Object.fromEntries(Object.entries(merged.concepts).map(([k, v]) => [k, v.attempts])),
    ).toEqual({
      a: 5,
      b: 4,
      c: 1,
    });
  });

  it('takes the newer review of a card and keeps cards only one side has', () => {
    const merged = mergeProgress(
      { ...empty, cards: { x: card('x', '2026-10-03T00:00:00.000Z'), y: card('y', null) } },
      { ...serverEmpty, cards: { x: card('x', '2026-10-02T00:00:00.000Z'), z: card('z', null) } },
    );
    expect(merged.cards.x!.lastReview).toBe('2026-10-03T00:00:00.000Z');
    expect(Object.keys(merged.cards).sort()).toEqual(['x', 'y', 'z']);
  });

  it('keeps a finished lesson finished and the furthest place', () => {
    const merged = mergeProgress(
      {
        ...empty,
        lessons: {
          l: {
            beat: 'practice',
            practiceIndex: 2,
            startedAt: '2026-10-02T00:00:00.000Z',
            completedAt: null,
          },
        },
      },
      {
        ...serverEmpty,
        lessons: {
          l: {
            conceptId: 'l',
            beat: 'story',
            practiceIndex: 0,
            startedAt: '2026-10-01T00:00:00.000Z',
            completedAt: '2026-10-01T01:00:00.000Z',
          },
          m: {
            conceptId: 'm',
            beat: 'see',
            practiceIndex: 0,
            startedAt: '2026-10-01T00:00:00.000Z',
            completedAt: null,
          },
        },
      },
    );
    expect(merged.lessons.l).toMatchObject({
      beat: 'practice',
      practiceIndex: 2,
      startedAt: '2026-10-01T00:00:00.000Z',
      completedAt: '2026-10-01T01:00:00.000Z',
    });
    expect(merged.lessons.m!.beat).toBe('see');
  });

  it('keeps the more recent streak and the longest ever', () => {
    const merged = mergeProgress(
      { ...empty, streak: { current: 2, longest: 9, lastActiveOn: '2026-10-02' } },
      { ...serverEmpty, streak: { current: 5, longest: 5, lastActiveOn: '2026-10-01' } },
    );
    expect(merged.streak).toEqual({ current: 2, longest: 9, lastActiveOn: '2026-10-02' });
    const same = mergeProgress(
      { ...empty, streak: { current: 3, longest: 3, lastActiveOn: '2026-10-02' } },
      { ...serverEmpty, streak: { current: 4, longest: 4, lastActiveOn: '2026-10-02' } },
    );
    expect(same.streak.current).toBe(4);
    expect(same.streak.longest).toBe(4);
  });
});
