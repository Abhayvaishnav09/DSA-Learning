/**
 * Turns step counts measured at growing input sizes (measure.ts) into a growth class.
 *
 * Each class is fitted as steps ≈ a·f(n) + b; the simplest class whose error is close to the
 * best one wins, so a straight line is never called n log n. Exponential growth is checked
 * separately (ln steps rising in a straight line with n).
 */

export const GROWTHS = [
  'O(1)',
  'O(log n)',
  'O(√n)',
  'O(n)',
  'O(n log n)',
  'O(n²)',
  'O(n³)',
  'O(2ⁿ)',
] as const;
export type Growth = (typeof GROWTHS)[number];

export type Point = [n: number, steps: number];

export interface RawSeries {
  label: string;
  points: Point[];
  capped: boolean;
  failed: boolean;
}

export interface RawMeasurement {
  mode: 'list' | 'size' | 'input' | 'graph' | 'text' | null;
  scaled?: string[];
  series: RawSeries[];
  partial?: boolean;
  /** Set when the run went over the time limit. */
  timedOut?: boolean;
  /** The call made up for a file that only defines functions. */
  call?: string;
}

export interface Fit {
  growth: Growth | null;
  /** Relative error of the winning fit (0 = perfect). */
  error: number;
}

const MODELS: [Growth, (n: number) => number][] = [
  ['O(log n)', (n) => Math.log2(n)],
  ['O(√n)', (n) => Math.sqrt(n)],
  ['O(n)', (n) => n],
  ['O(n log n)', (n) => n * Math.log2(n)],
  ['O(n²)', (n) => n * n],
  ['O(n³)', (n) => n * n * n],
];

/** Least squares for y = a·x + b; returns the relative RMS error, Infinity if a < 0. */
function lineError(xs: number[], ys: number[]): number {
  const k = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / k;
  const my = ys.reduce((s, y) => s + y, 0) / k;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  if (sxx === 0) return Infinity;
  const a = sxy / sxx;
  if (a < 0) return Infinity;
  const b = my - a * mx;
  const rms = Math.sqrt(ys.reduce((s, y, i) => s + (y - (a * xs[i]! + b)) ** 2, 0) / k);
  return rms / my;
}

/** R² of ln(steps) against n: close to 1 when every +1 in n multiplies the work. */
function exponentialFit(points: Point[]): { r2: number; slope: number } {
  const xs = points.map(([n]) => n);
  const ys = points.map(([, s]) => Math.log(s));
  const k = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / k;
  const my = ys.reduce((s, y) => s + y, 0) / k;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  });
  return { r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy), slope: sxy / sxx };
}

export function classifyGrowth(points: Point[]): Fit {
  if (points.length < 3) return { growth: null, error: Infinity };
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const steps = sorted.map(([, s]) => s);
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  if (hi - lo <= 2 || hi / lo <= 1.15) return { growth: 'O(1)', error: 0 };

  const ns = sorted.map(([n]) => n);
  const errors = MODELS.map(([growth, f]) => ({ growth, error: lineError(ns.map(f), steps) }));
  const best = Math.min(...errors.map((e) => e.error));

  const exp = exponentialFit(sorted);
  // Polynomials cannot keep up with 2ⁿ: when even n³ misses, a straight ln-line decides.
  const cubic = errors.find((e) => e.growth === 'O(n³)')!.error;
  if (exp.r2 >= 0.98 && exp.slope >= 0.2 && cubic > 0.05)
    return { growth: 'O(2ⁿ)', error: 1 - exp.r2 };

  // The simplest class that fits nearly as well as the best one (a straight line is not n log n).
  const winner = errors.find((e) => e.error <= best * 1.5 + 0.005)!;
  if (winner.error > 0.2) return { growth: null, error: winner.error };
  return winner;
}

export interface MeasuredCase {
  label: string;
  growth: Growth | null;
  /** The biggest input that was run, and the steps it took. */
  n: number;
  steps: number;
  points: Point[];
  /** Stopped early: the work grew past the step limit. */
  capped: boolean;
}

export interface Complexity {
  mode: 'list' | 'size' | 'input' | 'graph' | 'text';
  scaled: string[];
  cases: MeasuredCase[];
  best: MeasuredCase;
  worst: MeasuredCase;
  /** The usual "Big-O": the worst case's growth. */
  overall: Growth | null;
  partial: boolean;
  call?: string;
}

const rank = (g: Growth | null) => (g === null ? -1 : GROWTHS.indexOf(g));

/** Fits every case and picks the best and worst; null when there was nothing to measure. */
export function summarize(raw: RawMeasurement): Complexity | null {
  if (!raw.mode) return null;
  const cases: MeasuredCase[] = raw.series
    .filter((s) => s.points.length > 0 && !s.failed)
    .map((s) => {
      const last = s.points.at(-1)!;
      const { growth } = classifyGrowth(s.points);
      return {
        label: s.label,
        growth,
        n: last[0],
        steps: last[1],
        points: s.points,
        capped: s.capped,
      };
    });
  if (!cases.length) return null;
  // Compare cases by growth first, then by work at the same size.
  const order = (a: MeasuredCase, b: MeasuredCase) =>
    rank(a.growth) - rank(b.growth) || a.steps / a.n - b.steps / b.n;
  // A case whose growth could not be fitted says nothing about best or worst.
  const fitted = cases.filter((c) => c.growth !== null);
  const sorted = [...(fitted.length ? fitted : cases)].sort(order);
  const worst = sorted.at(-1)!;
  return {
    mode: raw.mode,
    scaled: raw.scaled ?? [],
    cases,
    best: sorted[0]!,
    worst,
    overall: worst.growth,
    partial: !!raw.partial || !!raw.timedOut,
    ...(raw.call ? { call: raw.call } : {}),
  };
}
