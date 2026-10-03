import { describe, expect, it } from 'vitest';
import type { Complexity } from './complexity';
import { verdict, type Derived } from './verdict';

const derived = (worst: string, extra: Partial<Derived> = {}): Derived => ({
  worst,
  best: worst,
  steps: [],
  unsure: [],
  hidden: false,
  graph: false,
  ...extra,
});
const measured = (overall: Complexity['overall']) => ({ overall }) as Complexity;

describe('verdict', () => {
  it('is certain when the structure and the runs agree', () => {
    expect(verdict(derived('O(n)'), measured('O(n)'))).toMatchObject({
      growth: 'O(n)',
      reason: 'both',
      certain: true,
    });
    expect(verdict(derived('O(V + E)'), measured('O(n)'))).toMatchObject({ reason: 'both' });
  });

  it('trusts the structure for work hidden inside built-ins', () => {
    expect(verdict(derived('O(n log n)', { hidden: true }), measured('O(n)'))).toMatchObject({
      growth: 'O(n log n)',
      reason: 'hidden',
      certain: true,
    });
  });

  it('lets the structure settle n against n log n', () => {
    expect(verdict(derived('O(n)'), measured('O(n log n)'))).toMatchObject({
      growth: 'O(n)',
      reason: 'close',
    });
  });

  it('explains when the tried inputs missed the worst case', () => {
    expect(verdict(derived('O(log n)'), measured('O(1)'))).toMatchObject({
      growth: 'O(log n)',
      reason: 'inputs',
    });
  });

  it('trusts the runs when they did more, or when a loop depends on the data', () => {
    expect(verdict(derived('O(n)'), measured('O(n²)'))).toMatchObject({
      growth: 'O(n²)',
      reason: 'measured-more',
      certain: false,
    });
    expect(verdict(derived('O(n)', { unsure: [4] }), measured('O(n²)'))).toMatchObject({
      growth: 'O(n²)',
      reason: 'unsure',
    });
  });

  it('uses whichever one there is', () => {
    expect(verdict(derived('O(n)'), null)).toMatchObject({ reason: 'derived', certain: true });
    expect(verdict(null, measured('O(n)'))).toMatchObject({ reason: 'measured', certain: false });
    expect(verdict(null, null)).toBeNull();
  });
});
