import { describe, expect, it } from 'vitest';
import { barPath, columnPath, compact, labelIndexes, nearestIndex, niceTicks } from './scale';

describe('niceTicks', () => {
  it('rounds to clean numbers from zero past the maximum', () => {
    expect(niceTicks(96)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(1284)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(100, 4)).toEqual([0, 25, 50, 75, 100]);
  });
  it('keeps whole-number ticks for counts of whole things', () => {
    expect(niceTicks(1, 4, true)).toEqual([0, 1]);
    expect(niceTicks(3, 4, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(7, 4, true)).toEqual([0, 2, 4, 6, 8]);
  });
  it('copes with an empty chart', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(-3)).toEqual([0, 1]);
  });
});

describe('compact', () => {
  it('shortens big numbers', () => {
    expect(compact(1284)).toBe('1.3K');
    expect(compact(42)).toBe('42');
    expect(compact(4_200_000)).toBe('4.2M');
  });
});

describe('labelIndexes', () => {
  it('shows every label when there is room, else spreads them ending on the last item', () => {
    expect(labelIndexes(4, 6)).toEqual([0, 1, 2, 3]);
    const spread = labelIndexes(30, 6);
    expect(spread.at(-1)).toBe(29);
    expect(spread.length).toBeLessThanOrEqual(6);
    expect(new Set(spread).size).toBe(spread.length);
    expect(labelIndexes(0, 5)).toEqual([]);
  });
});

describe('nearestIndex', () => {
  it('snaps a pointer to the nearest point and stays in range', () => {
    expect(nearestIndex(100, 0, 200, 5)).toBe(2);
    expect(nearestIndex(-50, 0, 200, 5)).toBe(0);
    expect(nearestIndex(900, 0, 200, 5)).toBe(4);
    expect(nearestIndex(10, 0, 200, 1)).toBe(0);
  });
});

describe('mark paths', () => {
  it('draws a column that is square at the baseline and rounded at the top', () => {
    const path = columnPath(10, 12, 100, 40);
    expect(path.startsWith('M10,100')).toBe(true);
    expect(path).toContain('Q10,40');
    expect(columnPath(10, 12, 100, 100)).toBe('');
    // A very short column never rounds more than it is tall.
    expect(columnPath(0, 12, 100, 98)).toContain('Q0,98');
  });
  it('draws a bar that grows from the left with a rounded end', () => {
    const path = barPath(0, 5, 10, 80);
    expect(path.startsWith('M0,5')).toBe(true);
    expect(path).toContain('Q80,5');
    expect(barPath(0, 5, 10, 0)).toBe('');
  });
});
