import type { Item, ItemOf, ItemType } from '@logicpath/content-schema';
import { run } from '@logicpath/visualizer/engine';
import { sameAnswer, sameSequence, tokens } from './normalize';

/**
 * Shared grading (docs/02-architecture.md §6.1): the browser uses it for instant feedback,
 * the server re-runs the same code as the source of truth.
 */

export type Answer =
  | { type: 'mcq'; option: number }
  | { type: 'predict-output'; text: string }
  | { type: 'arrange-steps'; order: number[] }
  | { type: 'fill-blank'; blanks: string[] }
  | { type: 'trace-table'; rows: string[][] }
  | { type: 'truth-table'; rows: ('true' | 'false')[][] };

export type AnswerOf<T extends ItemType> = Extract<Answer, { type: T }>;

export interface Verdict {
  correct: boolean;
  /** The wrong mental model this answer reveals, when we recognise it. */
  misconception: string | null;
  /** Which parts were right: one per blank or arranged line, or one per table cell. */
  parts: boolean[] | boolean[][] | null;
  /** Chance of getting this right by guessing; feeds the mastery model. */
  guessProbability: number;
}

const verdict = (correct: boolean, extra: Partial<Verdict> = {}): Verdict => ({
  correct,
  misconception: null,
  parts: null,
  guessProbability: 0.05,
  ...extra,
});

/** Runs a program and returns what it showed, or null if it fails (a broken program is a wrong answer). */
function tryOutput(source: string): { output: string[]; vars: Record<string, unknown> } | null {
  try {
    const last = run(source).at(-1)!;
    return { output: last.output, vars: last.vars };
  } catch {
    return null;
  }
}

/** Same variables with the same values, whatever order they were created in. */
function sameVars(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && a[k] === b[k]);
}

function gradeMcq(item: ItemOf<'mcq'>, { option }: AnswerOf<'mcq'>): Verdict {
  const chosen = item.options[option];
  if (!chosen) throw new RangeError(`option ${option} does not exist on ${item.id}`);
  return verdict(chosen.correct, {
    misconception: chosen.correct ? null : (chosen.misconception ?? null),
    guessProbability: 1 / item.options.length,
  });
}

function gradePredict(
  item: ItemOf<'predict-output'>,
  { text }: AnswerOf<'predict-output'>,
): Verdict {
  const matches = (expected: string) =>
    item.ask === 'last' ? sameAnswer(text, expected) : sameSequence(tokens(text), tokens(expected));
  if (matches(item.answer)) return verdict(true);
  const known = item.wrongAnswers.find((w) => matches(w.match));
  return verdict(false, { misconception: known?.misconception ?? null });
}

/** How many things an arrange item has to put in order. */
export const arrangeCount = (item: ItemOf<'arrange-steps'>) =>
  item.lines?.length ?? item.steps?.length ?? 0;

function gradeArrange(
  item: ItemOf<'arrange-steps'>,
  { order }: AnswerOf<'arrange-steps'>,
): Verdict {
  const n = arrangeCount(item);
  const isPermutation =
    order.length === n && new Set(order).size === n && order.every((i) => i >= 0 && i < n);
  if (!isPermutation) throw new RangeError(`order must use each of the ${n} lines once`);

  const parts = order.map((line, slot) => line === slot);
  const guessProbability = 0.05;
  if (parts.every(Boolean)) return verdict(true, { parts, guessProbability });

  if (!item.lines) {
    // Plain-language steps: right if it is one of the orders the author allows.
    const allowed = item.alsoCorrect.some(
      (alt) => alt.length === n && alt.every((v, i) => v === order[i]),
    );
    return verdict(allowed, { parts: allowed ? parts.map(() => true) : parts, guessProbability });
  }

  // Logic first: any order of program lines that works the same way is right.
  const lines = item.lines;
  const expected = tryOutput(lines.join('\n'));
  const actual = tryOutput(order.map((i) => lines[i]!).join('\n'));
  const equivalent =
    !!expected &&
    !!actual &&
    sameSequence(actual.output, item.expectedOutput ?? expected.output) &&
    sameVars(actual.vars, expected.vars);
  return verdict(equivalent, {
    parts: equivalent ? parts.map(() => true) : parts,
    guessProbability,
  });
}

function gradeTruthTable(item: ItemOf<'truth-table'>, { rows }: AnswerOf<'truth-table'>): Verdict {
  const parts = item.rows.map((row, r) => row.map((value, c) => rows[r]?.[c] === value));
  const correct = parts.every((row) => row.every(Boolean));
  const known = correct
    ? undefined
    : item.wrongAnswers.find((w) =>
        w.match.every((row, r) => row.every((v, c) => rows[r]?.[c] === v)),
      );
  return verdict(correct, {
    parts,
    misconception: known?.misconception ?? null,
    guessProbability: 0.5 ** Math.min(8, item.rows.length * item.outputs.length),
  });
}

function gradeFill(item: ItemOf<'fill-blank'>, { blanks }: AnswerOf<'fill-blank'>): Verdict {
  if (blanks.length !== item.blanks.length) {
    throw new RangeError(`${item.id} has ${item.blanks.length} blanks, got ${blanks.length}`);
  }
  const parts = item.blanks.map((blank, i) =>
    blank.accept.some((ok) => sameAnswer(blanks[i]!, ok)),
  );
  if (parts.every(Boolean)) return verdict(true, { parts });

  // Any fill that runs and shows the expected output also counts.
  const filled = blanks.map((b) => b.trim());
  if (filled.every((b) => b !== '' && !b.includes('\n'))) {
    let k = 0;
    const source = item.code.replace(/___/g, () => filled[k++]!);
    const result = tryOutput(source);
    if (result && sameSequence(result.output, item.expectedOutput)) {
      return verdict(true, { parts: parts.map(() => true) });
    }
  }

  const misconception =
    item.blanks
      .flatMap((blank, i) => blank.wrongAnswers.filter((w) => sameAnswer(blanks[i]!, w.match)))
      .at(0)?.misconception ?? null;
  return verdict(false, { parts, misconception });
}

function gradeTrace(item: ItemOf<'trace-table'>, { rows }: AnswerOf<'trace-table'>): Verdict {
  const cell = (table: string[][], r: number, c: number) => table[r]?.[c] ?? '';
  const sameTable = (a: string[][], b: string[][]) =>
    b.every((row, r) => row.every((value, c) => sameAnswer(cell(a, r, c), value)));

  const parts = item.rows.map((row, r) =>
    row.map((value, c) => sameAnswer(cell(rows, r, c), value)),
  );
  const correct = parts.every((row) => row.every(Boolean));
  const known = correct ? undefined : item.wrongAnswers.find((w) => sameTable(rows, w.match));
  return verdict(correct, {
    parts,
    misconception: known?.misconception ?? null,
    guessProbability: 0.02,
  });
}

export function grade<T extends ItemType>(item: ItemOf<T>, answer: AnswerOf<T>): Verdict;
export function grade(item: Item, answer: Answer): Verdict {
  if (item.type !== answer.type)
    throw new TypeError(`${item.id} is ${item.type}, answer is ${answer.type}`);
  switch (item.type) {
    case 'mcq':
      return gradeMcq(item, answer as AnswerOf<'mcq'>);
    case 'predict-output':
      return gradePredict(item, answer as AnswerOf<'predict-output'>);
    case 'arrange-steps':
      return gradeArrange(item, answer as AnswerOf<'arrange-steps'>);
    case 'fill-blank':
      return gradeFill(item, answer as AnswerOf<'fill-blank'>);
    case 'trace-table':
      return gradeTrace(item, answer as AnswerOf<'trace-table'>);
    case 'truth-table':
      return gradeTruthTable(item, answer as AnswerOf<'truth-table'>);
  }
}

/** The "explain why" check after a right answer. */
export function gradeExplain(item: Item, option: number): boolean {
  const chosen = item.explainWhy?.options[option];
  if (!chosen) throw new RangeError(`explain option ${option} does not exist on ${item.id}`);
  return chosen.correct;
}

/** The answer that grades as correct, used by content checks and the "show solution" button. */
export function correctAnswer(item: Item): Answer {
  switch (item.type) {
    case 'mcq':
      return { type: 'mcq', option: item.options.findIndex((o) => o.correct) };
    case 'predict-output':
      return { type: 'predict-output', text: item.answer };
    case 'arrange-steps':
      return {
        type: 'arrange-steps',
        order: Array.from({ length: arrangeCount(item) }, (_, i) => i),
      };
    case 'fill-blank':
      return { type: 'fill-blank', blanks: item.blanks.map((b) => b.accept[0]!) };
    case 'trace-table':
      return { type: 'trace-table', rows: item.rows };
    case 'truth-table':
      return { type: 'truth-table', rows: item.rows };
  }
}
