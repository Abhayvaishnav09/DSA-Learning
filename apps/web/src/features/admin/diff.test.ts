import { describe, expect, it } from 'vitest';
import { diffValues } from './diff';

describe('diffValues', () => {
  it('lists only what changed, by path', () => {
    const before = { id: 'a', prompt: { en: 'One', 'hi-Latn': 'Ek' }, hints: ['x', 'y'], level: 1 };
    const after = { id: 'a', prompt: { en: 'Two', 'hi-Latn': 'Ek' }, hints: ['x', 'z'], level: 1 };
    expect(diffValues(before, after)).toEqual([
      { path: 'prompt.en', before: 'One', after: 'Two' },
      { path: 'hints.1', before: 'y', after: 'z' },
    ]);
  });

  it('shows added and removed fields and list items', () => {
    expect(diffValues({ a: 1, b: [1, 2] }, { a: 1, b: [1], c: true })).toEqual([
      { path: 'c', before: null, after: 'true' },
      { path: 'b.1', before: '2', after: null },
    ]);
  });

  it('treats a brand new thing as all additions, and no difference as nothing', () => {
    expect(diffValues(undefined, { a: 'x', b: [] })).toEqual([
      { path: 'a', before: null, after: 'x' },
      { path: 'b', before: null, after: '[]' },
    ]);
    expect(diffValues({ a: 1 }, { a: 1 })).toEqual([]);
    expect(diffValues('same', 'same')).toEqual([]);
  });
});
