import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  dueCards,
  gradeFromAttempt,
  newCard,
  nextDue,
  scheduleReview,
  type ReviewGrade,
} from './review';

const now = new Date('2026-10-01T10:00:00Z');
const DAY = 86_400_000;
const daysUntilDue = (due: string, from: Date) => (Date.parse(due) - from.getTime()) / DAY;

describe('scheduleReview', () => {
  it('schedules a first good answer at least a day later', () => {
    const card = scheduleReview(newCard('i', now), 'good', now);
    expect(daysUntilDue(card.due, now)).toBeGreaterThanOrEqual(1);
    expect(card.reps).toBe(1);
  });

  it('spaces reviews further apart after each successful recall', () => {
    let card = scheduleReview(newCard('i', now), 'good', now);
    let reviewedAt = now;
    let gap = daysUntilDue(card.due, reviewedAt);
    for (let i = 0; i < 4; i++) {
      reviewedAt = new Date(card.due);
      card = scheduleReview(card, 'good', reviewedAt);
      const nextGap = daysUntilDue(card.due, reviewedAt);
      expect(nextGap).toBeGreaterThan(gap);
      gap = nextGap;
    }
  });

  it('orders intervals again ≤ hard ≤ good ≤ easy', () => {
    const grades: ReviewGrade[] = ['again', 'hard', 'good', 'easy'];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...grades), { maxLength: 6 }), (history) => {
        let card = newCard('i', now);
        let at = now;
        for (const grade of history) {
          card = scheduleReview(card, grade, at);
          at = new Date(card.due);
        }
        const gaps = grades.map((g) => daysUntilDue(scheduleReview(card, g, at).due, at));
        return gaps.every((gap, i) => i === 0 || gap >= gaps[i - 1]!);
      }),
    );
  });

  it('survives a JSON round trip', () => {
    const card = scheduleReview(newCard('i', now), 'good', now);
    expect(JSON.parse(JSON.stringify(card))).toEqual(card);
  });
});

describe('gradeFromAttempt', () => {
  it.each([
    [{ correct: false, hintLevel: 0, durationMs: 1000 }, 'again'],
    [{ correct: true, hintLevel: 2, durationMs: 1000 }, 'hard'],
    [{ correct: true, hintLevel: 0, durationMs: 10_000 }, 'easy'],
    [{ correct: true, hintLevel: 0, durationMs: 40_000 }, 'good'],
  ] as const)('%o → %s', (input, grade) => {
    expect(gradeFromAttempt({ ...input, expectedMs: 30_000 })).toBe(grade);
  });
});

describe('dueCards', () => {
  it('returns only due cards, most overdue first, capped', () => {
    const at = (days: number) => ({
      ...newCard(`d${days}`, now),
      due: new Date(now.getTime() + days * DAY).toISOString(),
    });
    const cards = [at(1), at(-1), at(-3), at(0)];
    expect(dueCards(cards, now).map((c) => c.itemId)).toEqual(['d-3', 'd-1', 'd0']);
    expect(dueCards(cards, now, 1).map((c) => c.itemId)).toEqual(['d-3']);
    expect(nextDue(cards)).toBe(at(-3).due);
  });
});
