import type { Item, ItemType, Lesson } from '@logicpath/content-schema';

const text = () => ({ en: '', 'hi-Latn': '' });

/** A starting point for each kind of question: the right shape, with the words left to write. */
export function blankItem(type: ItemType, concept: string, id: string): Item {
  const base = {
    id,
    concept,
    difficulty: 1,
    prompt: text(),
    hints: [text()],
    explanation: text(),
    estSeconds: 30,
  };
  switch (type) {
    case 'mcq':
      return {
        ...base,
        type,
        options: [
          { text: text(), correct: true },
          { text: text(), correct: false },
        ],
      };
    case 'predict-output':
      return { ...base, type, code: '', ask: 'last', answer: '', wrongAnswers: [] };
    case 'fill-blank':
      return {
        ...base,
        type,
        code: 'for i from 1 to ___:\n    say "hi"',
        blanks: [{ accept: [''], wrongAnswers: [] }],
        expectedOutput: [],
      };
    case 'arrange-steps':
      return {
        ...base,
        type,
        lines: ['', ''],
        alsoCorrect: [],
        expectedOutput: [''],
        subgoals: [],
      };
    case 'trace-table':
      return {
        ...base,
        type,
        code: '',
        line: 1,
        columns: ['i'],
        rows: [['']],
        given: [],
        wrongAnswers: [],
      };
    case 'truth-table':
      return {
        ...base,
        type,
        inputs: ['a', 'b'],
        outputs: [{ label: 'a and b', expression: 'a and b' }],
        rows: [['false'], ['false'], ['false'], ['true']],
        wrongAnswers: [],
      };
  }
}

export function blankLesson(concept: string): Lesson {
  return {
    concept,
    minutes: 7,
    story: { title: text(), body: [text()], terms: [] },
    see: { intro: text(), code: '', captions: {} },
    predict: { intro: text(), pauseAt: 1, item: '' },
    practice: [''],
    recap: [text()],
  };
}

/** An id nobody uses yet: concept.new-question, then concept.new-question-2, … */
export function freshId(prefix: string, taken: ReadonlySet<string>): string {
  if (!taken.has(prefix)) return prefix;
  for (let n = 2; ; n++) if (!taken.has(`${prefix}-${n}`)) return `${prefix}-${n}`;
}

/** The truth-table rows for N inputs (false first), with every output set to false. */
export function truthRows(inputs: number, outputs: number): ('true' | 'false')[][] {
  return Array.from({ length: 2 ** inputs }, () =>
    Array.from({ length: outputs }, () => 'false' as const),
  );
}
