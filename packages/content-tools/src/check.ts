import { LOCALES, type Item, type LocalizedText } from '@logicpath/content-schema';
import {
  correctAnswer,
  displayOrder,
  grade,
  sameAnswer,
  sameSequence,
  tokens,
} from '@logicpath/grader';
import { PseudoError, outputOf, run, traceRows } from '@logicpath/visualizer/engine';
import type { Issue, LoadedContent } from './load';

/**
 * Semantic checks that a schema can't express (docs/06-content-system.md §3):
 * the graph is sound, references resolve, every program runs, and every answer key is
 * actually right because we run the code and compare.
 */
export function checkContent(content: LoadedContent): Issue[] {
  const issues: Issue[] = [];
  const error = (file: string, message: string) =>
    issues.push({ file, message, severity: 'error' });
  const warn = (file: string, message: string) =>
    issues.push({ file, message, severity: 'warning' });

  const { graph } = content;
  const stages = new Set<number>();
  for (const stage of graph.stages) {
    if (stages.has(stage.id)) error('graph.yaml', `stage ${stage.id} is defined twice`);
    stages.add(stage.id);
  }

  const concepts = new Map(graph.concepts.map((c) => [c.id, c]));
  if (concepts.size !== graph.concepts.length) error('graph.yaml', 'a concept id is defined twice');
  for (const concept of graph.concepts) {
    if (!stages.has(concept.stage))
      error('graph.yaml', `${concept.id}: stage ${concept.stage} does not exist`);
    for (const prerequisite of concept.prerequisites) {
      const target = concepts.get(prerequisite);
      if (!target) error('graph.yaml', `${concept.id}: unknown prerequisite ${prerequisite}`);
      else if (target.stage > concept.stage) {
        error('graph.yaml', `${concept.id}: prerequisite ${prerequisite} is in a later stage`);
      }
    }
  }
  const cycle = findCycle(graph.concepts);
  if (cycle) error('graph.yaml', `prerequisites form a cycle: ${cycle.join(' → ')}`);

  const misconceptions = new Set(content.misconceptions.map((m) => m.id));
  const checkMisconception = (file: string, id: string | undefined) => {
    if (id && !misconceptions.has(id)) error(file, `unknown misconception ${id}`);
  };

  // ---------- items ----------
  const items = new Map<string, { file: string; item: Item }>();
  for (const { file, dirConcept, item } of content.items) {
    if (items.has(item.id))
      error(file, `item id ${item.id} is already used by ${items.get(item.id)!.file}`);
    items.set(item.id, { file, item });
    if (item.concept !== dirConcept)
      error(file, `concept is ${item.concept} but the file is in ${dirConcept}/`);
  }

  for (const { file, item } of items.values()) {
    if (item.variationOf) {
      const original = items.get(item.variationOf)?.item;
      if (!original) error(file, `variationOf ${item.variationOf} does not exist`);
      else if (original.type !== item.type || original.concept !== item.concept) {
        error(file, 'a variation must have the same type and concept as its original');
      }
    }
    checkItem(file, item, error, checkMisconception);
    checkReadability(file, item.prompt, warn);
  }

  // ---------- lessons ----------
  for (const [conceptId, { file, lesson }] of content.lessons) {
    if (!concepts.has(conceptId)) error(file, `${conceptId} is not in graph.yaml`);
    if (lesson.concept !== conceptId)
      error(file, `concept is ${lesson.concept} but the file is in ${conceptId}/`);

    const frames = attempt(file, 'see.code', () => run(lesson.see.code), error);
    if (frames) {
      if (lesson.predict.pauseAt >= frames.length - 1) {
        error(file, `predict.pauseAt must be before the last frame (${frames.length - 1})`);
      }
      for (const key of Object.keys(lesson.see.captions)) {
        if (Number(key) >= frames.length)
          error(file, `caption ${key} is past the last frame (${frames.length - 1})`);
      }
    }

    const used = new Set<string>();
    for (const id of [lesson.predict.item, ...lesson.practice]) {
      const found = items.get(id)?.item;
      if (!found) error(file, `item ${id} does not exist`);
      else if (found.concept !== conceptId) error(file, `item ${id} belongs to ${found.concept}`);
      if (used.has(id)) error(file, `item ${id} is used twice`);
      used.add(id);
    }
    for (const { file: itemFile, item } of items.values()) {
      if (item.concept === conceptId && !item.variationOf && !used.has(item.id)) {
        warn(itemFile, 'not used in the lesson and not a variation, so learners never see it');
      }
    }
    for (const paragraph of lesson.story.body) checkReadability(file, paragraph, warn);
  }

  return issues;
}

type Report = (file: string, message: string) => void;

function attempt<T>(file: string, what: string, fn: () => T, error: Report): T | null {
  try {
    return fn();
  } catch (e) {
    error(file, `${what}: ${e instanceof PseudoError ? e.message : String(e)}`);
    return null;
  }
}

function checkItem(
  file: string,
  item: Item,
  error: Report,
  checkMisconception: (file: string, id?: string) => void,
) {
  // Fill-blank code has holes; it is run below with the blanks filled in.
  if (item.code && item.type !== 'fill-blank') attempt(file, 'code', () => run(item.code!), error);

  switch (item.type) {
    case 'mcq':
      item.options.forEach((o) => checkMisconception(file, o.misconception));
      break;

    case 'predict-output': {
      item.wrongAnswers.forEach((w) => checkMisconception(file, w.misconception));
      const output = attempt(file, 'code', () => outputOf(item.code), error);
      if (output) {
        const actual = item.ask === 'last' ? (output.at(-1) ?? '') : output.join(' ');
        const right =
          item.ask === 'last'
            ? sameAnswer(actual, item.answer)
            : sameSequence(tokens(actual), tokens(item.answer));
        if (!right) error(file, `answer is "${item.answer}" but the program shows "${actual}"`);
      }
      for (const w of item.wrongAnswers) {
        if (grade(item, { type: 'predict-output', text: w.match }).correct) {
          error(file, `wrong answer "${w.match}" is graded as correct`);
        }
      }
      break;
    }

    case 'fill-blank': {
      item.blanks.forEach((b) =>
        b.wrongAnswers.forEach((w) => checkMisconception(file, w.misconception)),
      );
      const holes = item.code.split('___').length - 1;
      if (holes !== item.blanks.length)
        error(file, `code has ${holes} blanks but ${item.blanks.length} are defined`);
      let k = 0;
      const filled = item.code.replace(/___/g, () => item.blanks[k++]?.accept[0] ?? '___');
      const output = attempt(file, 'filled code', () => outputOf(filled), error);
      if (output && !sameSequence(output, item.expectedOutput)) {
        error(
          file,
          `filled program shows [${output.join(', ')}], expected [${item.expectedOutput.join(', ')}]`,
        );
      }
      item.blanks.forEach((blank, i) => {
        for (const w of blank.wrongAnswers) {
          const blanks = item.blanks.map((b, j) => (j === i ? w.match : b.accept[0]!));
          if (grade(item, { type: 'fill-blank', blanks }).correct)
            error(file, `wrong answer "${w.match}" is graded as correct`);
        }
      });
      break;
    }

    case 'arrange-steps': {
      const output = attempt(file, 'lines', () => outputOf(item.lines.join('\n')), error);
      if (output && !sameSequence(output, item.expectedOutput)) {
        error(
          file,
          `lines show [${output.join(', ')}], expected [${item.expectedOutput.join(', ')}]`,
        );
      }
      if (
        grade(item, { type: 'arrange-steps', order: displayOrder(item.id, item.lines.length) })
          .correct
      ) {
        error(file, 'the shuffled order is already a correct answer; change the lines or the id');
      }
      break;
    }

    case 'trace-table': {
      item.wrongAnswers.forEach((w) => checkMisconception(file, w.misconception));
      const frames = attempt(file, 'code', () => run(item.code), error);
      if (frames) {
        const expected = traceRows(frames, item.line, item.columns);
        if (expected.length === 0) error(file, `line ${item.line} never runs`);
        if (JSON.stringify(expected) !== JSON.stringify(item.rows)) {
          error(file, `rows should be ${JSON.stringify(expected)}`);
        }
      }
      for (const [r, c] of item.given) {
        if (r >= item.rows.length || c >= item.columns.length)
          error(file, `given cell [${r}, ${c}] is outside the table`);
      }
      for (const w of item.wrongAnswers) {
        if (grade(item, { type: 'trace-table', rows: w.match }).correct)
          error(file, 'a wrong answer is graded as correct');
      }
      break;
    }
  }

  if (!grade(item, correctAnswer(item) as never).correct)
    error(file, 'the correct answer does not grade as correct');
}

/** Grade 6 to 8 reading level, roughly: warn on long sentences (docs/01-learning-science.md §9). */
function checkReadability(file: string, text: LocalizedText, warn: Report) {
  for (const locale of LOCALES) {
    for (const sentence of text[locale].split(/[.!?]\s/)) {
      const words = sentence.split(/\s+/).filter(Boolean).length;
      if (words > 28)
        warn(
          file,
          `${locale}: a ${words}-word sentence is hard for beginners: "${sentence.slice(0, 50)}…"`,
        );
    }
  }
}

function findCycle(
  concepts: readonly { id: string; prerequisites: readonly string[] }[],
): string[] | null {
  const prerequisites = new Map(concepts.map((c) => [c.id, c.prerequisites]));
  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...path.slice(path.indexOf(id)), id];
    state.set(id, 'visiting');
    path.push(id);
    for (const next of prerequisites.get(id) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    path.pop();
    state.set(id, 'done');
    return null;
  };

  for (const { id } of concepts) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}
