import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms';
import { summarize, type RawMeasurement } from './complexity';
import { CORPUS } from './corpus';
import type { RawTrace } from './toFrames';
import { TRACER_PY } from './tracer';
import { verdict } from './verdict';

/** Every corpus program, through the real tracer under real Pyodide. */
let trace: (code: string) => RawTrace;
let measure: (code: string) => RawMeasurement;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(TRACER_PY);
  const t = py.globals.get('trace') as (code: string, stdin: string) => string;
  const m = py.globals.get('measure') as (code: string, stdin: string) => string;
  trace = (code) => JSON.parse(t(code, '')) as RawTrace;
  measure = (code) => JSON.parse(m(code, '')) as RawMeasurement;
}, 120_000);

// A graph's V + E and the sieve's n log log n both count like n.
const asCounted = (g: string) => (g === 'O(V + E)' || g === 'O(n log log n)' ? 'O(n)' : g);

describe.each(CORPUS)('$id', (program) => {
  it('is recognised by name, or not named at all', () => {
    expect(trace(program.code).algorithms?.map((a) => a.id)).toEqual(
      program.algorithm ? [program.algorithm] : [],
    );
  });

  it('gets its Big-O from the structure, step by step', () => {
    const derived = trace(program.code).derived!;
    expect(derived.worst).toBe(program.worst);
    expect(derived.best).toBe(program.best);
    expect(derived.unsure).toEqual([]);
    expect(derived.steps.length).toBeGreaterThan(0);
  });

  it('is measured on real runs, and the final answer is certain and right', () => {
    const derived = trace(program.code).derived!;
    const measured = summarize(measure(program.code));
    expect(measured?.overall).toBe(program.measured ?? asCounted(program.worst));
    const answer = verdict(derived, measured)!;
    expect(answer.growth).toBe(program.worst);
    expect(answer.certain).toBe(true);
  });

  if (program.algorithm)
    it('matches the textbook', () => {
      expect(ALGORITHMS[program.algorithm!]!.worst.growth).toBe(program.worst);
    });
});
