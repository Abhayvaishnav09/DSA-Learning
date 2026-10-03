import {
  ALGORITHMS,
  framesFromTrace,
  summarize,
  TRACER_PY,
  type RawMeasurement,
  type RawTrace,
} from '@logicpath/visualizer/python';
import { viewPseudocode } from '@logicpath/visualizer/view';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';

let trace: (code: string) => RawTrace;
let measure: (code: string) => RawMeasurement;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(TRACER_PY);
  const fn = py.globals.get('trace') as (code: string, stdin: string) => string;
  trace = (code) => JSON.parse(fn(code, '')) as RawTrace;
  const m = py.globals.get('measure') as (code: string, stdin: string) => string;
  measure = (code) => JSON.parse(m(code, '')) as RawMeasurement;
}, 120_000);

const OUTPUT: Record<string, string[]> = {
  'linear-search': ["Is 'Emma' in papers list? True"],
  'binary-search': ['5'],
  'bubble-sort': ['[1, 2, 4, 5, 8]'],
  largest: ['Highest marks: 91'],
  'insertion-sort': ['[1, 3, 5, 7, 9]'],
  fibonacci: ['5'],
  'pseudo-search': ['true'],
};

describe('visualize examples', () => {
  it.each(EXAMPLES)('$id runs without errors and prints what it should', (example) => {
    const frames =
      example.language === 'python'
        ? framesFromTrace(trace(example.code), example.code)
        : viewPseudocode(example.code);
    const last = frames.at(-1)!;
    expect(last.error).toBeUndefined();
    expect(last.output).toEqual(OUTPUT[example.id]);
    expect(last.checks).toBeGreaterThan(0);
  });
});

/** Each Python example is recognised, and its measured growth matches the textbook. */
const RECOGNISED: Record<string, string> = {
  'linear-search': 'linear-search',
  'binary-search': 'binary-search',
  'bubble-sort': 'bubble-sort',
  'insertion-sort': 'insertion-sort',
  fibonacci: 'branching-recursion',
  largest: 'find-extreme',
};

describe('visualize examples: algorithm and Big-O', () => {
  it.each(EXAMPLES.filter((e) => e.language === 'python'))('$id', (example) => {
    const algorithm = RECOGNISED[example.id]!;
    expect(trace(example.code).algorithms?.map((a) => a.id)).toEqual([algorithm]);
    const measured = summarize(measure(example.code))!;
    const book = ALGORITHMS[algorithm]!;
    expect(measured.overall).toBe(book.worst.growth);
    expect(measured.best.growth).toBe(book.best.growth);
  });
});
