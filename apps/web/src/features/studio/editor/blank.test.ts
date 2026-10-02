import { Item, Lesson } from '@logicpath/content-schema';
import { describe, expect, it } from 'vitest';
import { blankItem, blankLesson, freshId, truthRows } from './blank';

const TYPES = [
  'mcq',
  'predict-output',
  'fill-blank',
  'arrange-steps',
  'trace-table',
  'truth-table',
] as const;

describe('blank templates', () => {
  it('has the right shape for every kind of question (only the words are missing)', () => {
    for (const type of TYPES) {
      const item = blankItem(type, 'loops.counter', 'loops.counter.new');
      expect(item.type).toBe(type);
      const parsed = Item.safeParse(item);
      // Empty words are rejected, but nothing about the shape is.
      const shapeProblems = parsed.success
        ? []
        : parsed.error.issues.filter(
            (i) =>
              i.code === 'unrecognized_keys' ||
              i.code === 'invalid_union' ||
              i.code === 'invalid_type',
          );
      expect(shapeProblems, type).toEqual([]);
    }
  });

  it('becomes a valid question once the words are written', () => {
    const item = blankItem('mcq', 'loops.counter', 'loops.counter.new');
    if (item.type !== 'mcq') throw new Error('unreachable');
    const filled = {
      ...item,
      prompt: { en: 'How many?', 'hi-Latn': 'Kitne?' },
      hints: [{ en: 'Count', 'hi-Latn': 'Gino' }],
      explanation: { en: 'Because', 'hi-Latn': 'Kyunki' },
      options: [
        { text: { en: '3', 'hi-Latn': '3' }, correct: true },
        { text: { en: '4', 'hi-Latn': '4' }, correct: false },
      ],
    };
    expect(Item.safeParse(filled).success).toBe(true);
  });

  it('starts a lesson in the right shape', () => {
    const lesson = blankLesson('loops.counter');
    expect(lesson.concept).toBe('loops.counter');
    expect(Lesson.safeParse(lesson).success).toBe(false); // words missing
    expect(lesson.practice).toHaveLength(1);
  });
});

describe('freshId and truthRows', () => {
  it('finds an unused id', () => {
    expect(freshId('a.new', new Set())).toBe('a.new');
    expect(freshId('a.new', new Set(['a.new']))).toBe('a.new-2');
    expect(freshId('a.new', new Set(['a.new', 'a.new-2']))).toBe('a.new-3');
  });
  it('makes a row for every combination of inputs', () => {
    expect(truthRows(2, 1)).toEqual([['false'], ['false'], ['false'], ['false']]);
    expect(truthRows(3, 2)).toHaveLength(8);
    expect(truthRows(1, 3)[0]).toEqual(['false', 'false', 'false']);
  });
});
