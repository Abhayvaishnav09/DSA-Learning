import type { Complexity } from './complexity';

/** One line of reasoning from derive.ts ("line 3: for p in papers runs n times …"). */
export interface DerivedStep {
  line: number;
  code: string;
  kind: string;
  iters?: string;
  body?: string;
  cost?: string;
  fn?: string;
  calls?: number;
  work?: string;
  name?: string;
}

/** What derive.ts worked out from the shape of the code. */
export interface Derived {
  worst: string;
  best: string;
  steps: DerivedStep[];
  /** Lines whose loop count depends on the data in a way the shape does not settle. */
  unsure: number[];
  /** Built-ins (sorted, `in` on a list, max(list)) do work that counting lines cannot see. */
  hidden: boolean;
  graph: boolean;
}

const ORDER = [
  'O(1)',
  'O(log n)',
  'O(√n)',
  'O(n)',
  'O(V + E)',
  'O(n log log n)',
  'O(n log n)',
  'O(n√n)',
  'O(n²)',
  'O(n² log n)',
  'O(n³)',
  'O(n⁴)',
  'O(2ⁿ)',
];

export const growthRank = (g: string) => {
  const i = ORDER.indexOf(g);
  return i < 0 ? ORDER.length - 2 : i;
};

/**
 * Classes a line count cannot tell apart: a graph's V + E is linear in its size, and
 * log log n grows so slowly that n log log n counts like n.
 */
const comparable = (g: string) => (g === 'O(V + E)' || g === 'O(n log log n)' ? 'O(n)' : g);
const CLOSE = new Set(['O(n)', 'O(n log n)']);

export type VerdictReason =
  /** The structure and the runs agree. */
  | 'both'
  /** The structure shows built-in work the line count cannot see. */
  | 'hidden'
  /** n and n log n: too close for the runs, the structure decides. */
  | 'close'
  /** The tried inputs never hit the worst case; the structure shows it. */
  | 'inputs'
  /** The runs did more than the structure predicted: the runs win. */
  | 'measured-more'
  /** A loop's count depends on the data: the runs decide. */
  | 'unsure'
  /** Only the structure (nothing to run bigger). */
  | 'derived'
  /** Only the runs. */
  | 'measured';

export interface Verdict {
  growth: string;
  reason: VerdictReason;
  derived?: string;
  measured?: string;
  /** Two independent ways agree, or the structure explains exactly why they differ. */
  certain: boolean;
}

/** The one answer to show, from the derivation and the measurement together. */
export function verdict(
  derived: Derived | null | undefined,
  measured: Complexity | null | undefined,
): Verdict | null {
  const d = derived?.worst;
  const m = measured?.overall ?? undefined;
  const unsure = !!derived?.unsure.length;
  const base = { derived: d, measured: m };
  if (d && m) {
    if (comparable(d) === comparable(m))
      return { growth: d, reason: 'both', ...base, certain: true };
    if (unsure) return { growth: m, reason: 'unsure', ...base, certain: false };
    const more = growthRank(d) > growthRank(m);
    if (more && derived?.hidden) return { growth: d, reason: 'hidden', ...base, certain: true };
    if (CLOSE.has(d) && CLOSE.has(m)) return { growth: d, reason: 'close', ...base, certain: true };
    if (more) return { growth: d, reason: 'inputs', ...base, certain: true };
    return { growth: m, reason: 'measured-more', ...base, certain: false };
  }
  if (d) return { growth: d, reason: unsure ? 'unsure' : 'derived', ...base, certain: !unsure };
  if (m) return { growth: m, reason: 'measured', ...base, certain: false };
  return null;
}
