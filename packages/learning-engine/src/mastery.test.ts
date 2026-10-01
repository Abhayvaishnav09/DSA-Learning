import { describe, expect, it } from 'vitest';
import { localDate } from './dates';
import {
  applyAttempt,
  conceptStatus,
  isMastered,
  type ConceptState,
  type GraphConcept,
} from './mastery';

const tz = 'Asia/Kolkata';
const day1 = new Date('2026-10-01T10:00:00+05:30');
const day1Late = new Date('2026-10-01T23:30:00+05:30');
const day2 = new Date('2026-10-02T09:00:00+05:30');

function practise(state: ConceptState | undefined, at: Date, times: number, correct = true) {
  let s = state;
  for (let i = 0; i < times; i++) {
    s = applyAttempt(s, { conceptId: 'c', at, correct, hintLevel: 0 }, { timeZone: tz });
  }
  return s!;
}

describe('localDate', () => {
  it('uses the learner time zone, not UTC', () => {
    // 23:30 in India is still 18:00 UTC on the same day; 01:00 in India is the previous UTC day.
    expect(localDate(day1Late, tz)).toBe('2026-10-01');
    expect(localDate(new Date('2026-10-02T01:00:00+05:30'), tz)).toBe('2026-10-02');
  });
});

describe('applyAttempt', () => {
  it('is not mastered on the first day, however many correct answers', () => {
    const state = practise(undefined, day1, 10);
    expect(state.pKnown).toBeGreaterThan(0.95);
    expect(state.recallPassedOn).toBeNull();
    expect(isMastered(state)).toBe(false);
  });

  it('is mastered after an unaided correct answer on a later day', () => {
    const state = practise(practise(undefined, day1, 6), day2, 1);
    expect(state.recallPassedOn).toBe('2026-10-02');
    expect(isMastered(state)).toBe(true);
  });

  it('does not count a hinted answer as delayed recall', () => {
    const before = practise(undefined, day1, 6);
    const state = applyAttempt(
      before,
      { conceptId: 'c', at: day2, correct: true, hintLevel: 1 },
      { timeZone: tz },
    );
    expect(state.recallPassedOn).toBeNull();
  });

  it('sends a forgotten concept back into practice', () => {
    const mastered = practise(practise(undefined, day1, 6), day2, 1);
    const forgot = practise(mastered, new Date('2026-10-09T09:00:00+05:30'), 1, false);
    expect(isMastered(forgot)).toBe(false);
    expect(forgot.recallPassedOn).toBeNull();
  });
});

describe('conceptStatus', () => {
  const concepts: GraphConcept[] = [
    { id: 'a', prerequisites: [], published: true },
    { id: 'b', prerequisites: ['a'], published: true },
    { id: 'c', prerequisites: ['planned'], published: true },
    { id: 'planned', prerequisites: [], published: false },
  ];
  const graph = new Map(concepts.map((c) => [c.id, c]));
  const status = (id: string, states: Record<string, ConceptState> = {}) =>
    conceptStatus(graph.get(id)!, states, graph);

  it('locks a concept until its published prerequisites are mastered', () => {
    expect(status('a')).toBe('available');
    expect(status('b')).toBe('locked');
    const a = practise(practise(undefined, day1, 6), day2, 1);
    expect(status('b', { a })).toBe('available');
  });

  it('does not let unpublished prerequisites block a concept', () => {
    expect(status('c')).toBe('available');
    expect(status('planned')).toBe('locked');
  });

  it('reports learning once practice has started', () => {
    expect(status('a', { a: practise(undefined, day1, 1) })).toBe('learning');
  });
});
