import { describe, expect, it } from 'vitest';
import { classifyGrowth, summarize, type Point } from './complexity';

const sizes = [8, 16, 32, 64, 128];
const grow = (f: (n: number) => number): Point[] => sizes.map((n) => [n, Math.round(f(n))]);

describe('classifyGrowth', () => {
  const shapes: [string, (n: number) => number][] = [
    ['O(1)', () => 8],
    ['O(log n)', (n: number) => 5 * Math.log2(n) + 3],
    ['O(n)', (n: number) => 2 * n + 7],
    ['O(n log n)', (n: number) => 3 * n * Math.log2(n) + 10],
    ['O(n²)', (n: number) => n * n + 4 * n],
    ['O(n³)', (n: number) => (n * n * n) / 10 + n],
  ];
  it.each(shapes)('recognises %s', (growth, f) => {
    expect(classifyGrowth(grow(f)).growth).toBe(growth);
  });

  it('recognises exponential growth from a few sizes', () => {
    expect(
      classifyGrowth([
        [2, 8],
        [4, 20],
        [8, 136],
        [16, 6388],
      ]).growth,
    ).toBe('O(2ⁿ)');
  });

  it('says nothing with fewer than three sizes', () => {
    expect(
      classifyGrowth([
        [8, 10],
        [16, 20],
      ]).growth,
    ).toBeNull();
  });
});

describe('summarize', () => {
  it('picks the best and worst cases and quotes the worst as the Big-O', () => {
    const result = summarize({
      mode: 'list',
      scaled: ['papers'],
      series: [
        { label: 'first', points: grow(() => 8), capped: false, failed: false },
        { label: 'missing', points: grow((n) => 2 * n + 7), capped: false, failed: false },
      ],
    })!;
    expect(result.best).toMatchObject({ label: 'first', growth: 'O(1)', n: 128, steps: 8 });
    expect(result.worst).toMatchObject({ label: 'missing', growth: 'O(n)' });
    expect(result.overall).toBe('O(n)');
  });

  it('is null when there was no input to grow', () => {
    expect(summarize({ mode: null, series: [] })).toBeNull();
  });
});
