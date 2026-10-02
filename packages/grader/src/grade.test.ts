import { Item, type ItemOf, type ItemType } from '@logicpath/content-schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { correctAnswer, grade, gradeExplain } from './grade';
import { sameAnswer, tokens } from './normalize';
import { displayOrder } from './shuffle';

const t = (en: string) => ({ en, 'hi-Latn': en });
const base = {
  concept: 'loops.counter',
  difficulty: 1,
  prompt: t('prompt'),
  hints: [t('hint')],
  explanation: t('because'),
  estSeconds: 30,
};
const make = <T extends ItemType>(raw: Record<string, unknown>) =>
  Item.parse({ ...base, ...raw }) as ItemOf<T>;

const mcq = make<'mcq'>({
  id: 'mcq-1',
  type: 'mcq',
  options: [
    { text: t('3'), misconception: 'loop.off-by-one.fewer' },
    { text: t('4'), correct: true },
    { text: t('5'), misconception: 'loop.off-by-one.extra' },
  ],
  explainWhy: {
    question: t('why?'),
    options: [{ text: t('right'), correct: true }, { text: t('wrong') }],
  },
});

const predict = make<'predict-output'>({
  id: 'predict-1',
  type: 'predict-output',
  code: 'total = 0\nfor i from 1 to 5:\n    total = total + 1\nsay total',
  ask: 'last',
  answer: '5',
  wrongAnswers: [{ match: '6', misconception: 'loop.off-by-one.extra' }],
});

const arrange = make<'arrange-steps'>({
  id: 'arrange-1',
  type: 'arrange-steps',
  lines: ['a = 1', 'b = 2', 'say a + b'],
  expectedOutput: ['3'],
});

const fill = make<'fill-blank'>({
  id: 'fill-1',
  type: 'fill-blank',
  code: 'for i from 1 to ___:\n    say "Hello"',
  blanks: [
    { accept: ['3'], wrongAnswers: [{ match: '4', misconception: 'loop.off-by-one.extra' }] },
  ],
  expectedOutput: ['Hello', 'Hello', 'Hello'],
});

const trace = make<'trace-table'>({
  id: 'trace-1',
  type: 'trace-table',
  code: 'steps = 0\nfor i from 1 to 2:\n    steps = steps + 2',
  line: 3,
  columns: ['i', 'steps'],
  rows: [
    ['1', '2'],
    ['2', '4'],
  ],
  wrongAnswers: [
    {
      match: [
        ['0', '2'],
        ['1', '4'],
      ],
      misconception: 'loop.starts-at-zero',
    },
  ],
});

describe('normalize', () => {
  it('ignores case, spacing, quotes and number formatting', () => {
    expect(sameAnswer('  Done ', 'done')).toBe(true);
    expect(sameAnswer('"done"', 'done')).toBe(true);
    expect(sameAnswer('5.0', '5')).toBe(true);
    expect(sameAnswer('5', '6')).toBe(false);
    expect(sameAnswer('', '0')).toBe(false);
    expect(tokens('1, 2,3\n4')).toEqual(['1', '2', '3', '4']);
  });
});

describe('grade', () => {
  it('grades multiple choice and names the misconception', () => {
    expect(grade(mcq, { type: 'mcq', option: 1 })).toMatchObject({
      correct: true,
      guessProbability: 1 / 3,
    });
    expect(grade(mcq, { type: 'mcq', option: 2 })).toMatchObject({
      correct: false,
      misconception: 'loop.off-by-one.extra',
    });
    expect(gradeExplain(mcq, 0)).toBe(true);
    expect(gradeExplain(mcq, 1)).toBe(false);
  });

  it('grades predicted output leniently and spots known wrong answers', () => {
    expect(grade(predict, { type: 'predict-output', text: ' 5 ' }).correct).toBe(true);
    expect(grade(predict, { type: 'predict-output', text: '6' })).toMatchObject({
      correct: false,
      misconception: 'loop.off-by-one.extra',
    });
    expect(grade(predict, { type: 'predict-output', text: 'five' }).misconception).toBeNull();
  });

  it('accepts any arrangement that works the same way', () => {
    expect(grade(arrange, { type: 'arrange-steps', order: [0, 1, 2] }).correct).toBe(true);
    // Setting b before a changes nothing.
    expect(grade(arrange, { type: 'arrange-steps', order: [1, 0, 2] })).toMatchObject({
      correct: true,
      parts: [true, true, true],
    });
    // Showing the sum before b exists is a broken program.
    expect(grade(arrange, { type: 'arrange-steps', order: [0, 2, 1] })).toMatchObject({
      correct: false,
      parts: [true, false, false],
    });
    expect(() => grade(arrange, { type: 'arrange-steps', order: [0, 0, 1] })).toThrow(RangeError);
  });

  it('accepts listed fills and any fill that produces the right output', () => {
    expect(grade(fill, { type: 'fill-blank', blanks: ['3'] }).correct).toBe(true);
    expect(grade(fill, { type: 'fill-blank', blanks: ['2 + 1'] }).correct).toBe(true);
    expect(grade(fill, { type: 'fill-blank', blanks: ['4'] })).toMatchObject({
      correct: false,
      misconception: 'loop.off-by-one.extra',
      parts: [false],
    });
    expect(grade(fill, { type: 'fill-blank', blanks: ['"oops'] }).correct).toBe(false);
  });

  it('grades a trace table cell by cell', () => {
    expect(
      grade(trace, {
        type: 'trace-table',
        rows: [
          ['1', '2'],
          ['2', '4'],
        ],
      }).correct,
    ).toBe(true);
    expect(
      grade(trace, {
        type: 'trace-table',
        rows: [
          ['1', '2'],
          ['2', '3'],
        ],
      }),
    ).toMatchObject({
      correct: false,
      parts: [
        [true, true],
        [true, false],
      ],
    });
    expect(
      grade(trace, {
        type: 'trace-table',
        rows: [
          ['0', '2'],
          ['1', '4'],
        ],
      }).misconception,
    ).toBe('loop.starts-at-zero');
  });

  it('accepts its own correct answer for every item type', () => {
    for (const item of [mcq, predict, arrange, fill, trace]) {
      expect(grade(item, correctAnswer(item) as never).correct).toBe(true);
    }
  });

  it('rejects an answer of the wrong type', () => {
    expect(() => grade(mcq, { type: 'predict-output', text: '4' } as never)).toThrow(TypeError);
  });
});

describe('displayOrder', () => {
  it('is a stable permutation that never shows the authored order', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 2, max: 10 }), (key, n) => {
        const order = displayOrder(key, n);
        const isPermutation = [...order].sort((a, b) => a - b).every((v, i) => v === i);
        const authored = order.every((v, i) => v === i);
        return (
          isPermutation &&
          !authored &&
          JSON.stringify(order) === JSON.stringify(displayOrder(key, n))
        );
      }),
    );
  });
});

describe('stage 0 and logic item types', () => {
  const steps = make<'arrange-steps'>({
    id: 'tea',
    type: 'arrange-steps',
    steps: [t('Boil water'), t('Add tea leaves'), t('Add milk'), t('Pour into a cup')],
    alsoCorrect: [[0, 2, 1, 3]],
  });

  it('grades plain steps by order, allowing listed alternatives', () => {
    expect(grade(steps, { type: 'arrange-steps', order: [0, 1, 2, 3] }).correct).toBe(true);
    expect(grade(steps, { type: 'arrange-steps', order: [0, 2, 1, 3] }).correct).toBe(true);
    expect(grade(steps, { type: 'arrange-steps', order: [3, 2, 1, 0] })).toMatchObject({
      correct: false,
      parts: [false, false, false, false],
    });
    expect(grade(steps, correctAnswer(steps) as never).correct).toBe(true);
  });

  const truth = make<'truth-table'>({
    id: 'and',
    type: 'truth-table',
    inputs: ['a', 'b'],
    outputs: [{ label: 'a and b', expression: 'a and b' }],
    rows: [['false'], ['false'], ['false'], ['true']],
    wrongAnswers: [
      { match: [['false'], ['true'], ['true'], ['true']], misconception: 'logic.and-or-swap' },
    ],
  });

  it('grades truth tables cell by cell and spots AND/OR mix-ups', () => {
    expect(
      grade(truth, { type: 'truth-table', rows: [['false'], ['false'], ['false'], ['true']] })
        .correct,
    ).toBe(true);
    const swapped = grade(truth, {
      type: 'truth-table',
      rows: [['false'], ['true'], ['true'], ['true']],
    });
    expect(swapped).toMatchObject({ correct: false, misconception: 'logic.and-or-swap' });
    expect(swapped.parts).toEqual([[true], [false], [false], [true]]);
    expect(swapped.guessProbability).toBeCloseTo(1 / 16);
  });
});
