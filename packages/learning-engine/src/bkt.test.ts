import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BKT, updateKnowledge, type HintLevel } from './bkt';

const probability = fc.double({ min: 0, max: 1, noNaN: true });
const hintLevel = fc.constantFrom<HintLevel>(0, 1, 2, 3);

describe('updateKnowledge', () => {
  it('raises knowledge after a correct unaided answer', () => {
    expect(updateKnowledge(0.1, { correct: true, hintLevel: 0 })).toBeGreaterThan(0.1);
  });

  it('lowers knowledge of a confident learner after a wrong answer', () => {
    expect(updateKnowledge(0.9, { correct: false, hintLevel: 0 })).toBeLessThan(0.9);
  });

  it('reaches the mastery threshold after a handful of unaided correct answers', () => {
    let p = DEFAULT_BKT.pInit;
    for (let i = 0; i < 4; i++) p = updateKnowledge(p, { correct: true, hintLevel: 0 });
    expect(p).toBeGreaterThan(0.95);
  });

  it('always stays strictly between 0 and 1', () => {
    fc.assert(
      fc.property(probability, fc.boolean(), hintLevel, (p, correct, hint) => {
        const next = updateKnowledge(p, { correct, hintLevel: hint });
        return next > 0 && next < 1;
      }),
    );
  });

  it('gives less credit the more hints were used', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.9, noNaN: true }), (p) => {
        const credit = ([0, 1, 2, 3] as const).map((h) =>
          updateKnowledge(p, { correct: true, hintLevel: h }),
        );
        return credit.every((value, i) => i === 0 || value <= credit[i - 1]!);
      }),
    );
  });

  it('gives less credit to a right answer with a wrong explanation', () => {
    const explained = updateKnowledge(0.3, {
      correct: true,
      hintLevel: 0,
      explainedCorrectly: true,
    });
    const guessed = updateKnowledge(0.3, {
      correct: true,
      hintLevel: 0,
      explainedCorrectly: false,
    });
    expect(guessed).toBeLessThan(explained);
  });

  it('gives less credit for an easy-to-guess question', () => {
    const twoOptions = updateKnowledge(0.3, { correct: true, hintLevel: 0, guessProbability: 0.5 });
    const freeText = updateKnowledge(0.3, { correct: true, hintLevel: 0, guessProbability: 0.01 });
    expect(twoOptions).toBeLessThan(freeText);
  });
});
