import type { Item, ItemOf, ItemType } from '@logicpath/content-schema';
import { arrangeCount, type Answer, type AnswerOf } from '@logicpath/grader';

/** What the learner is building before they press Check. */
export type Draft =
  | { type: 'mcq'; option: number | null }
  | { type: 'predict-output'; text: string }
  | { type: 'arrange-steps'; order: number[] }
  | { type: 'fill-blank'; blanks: string[] }
  | { type: 'trace-table'; rows: string[][] }
  | { type: 'truth-table'; rows: TruthCell[][] };

export type TruthCell = 'true' | 'false' | '';

export type DraftOf<T extends ItemType> = Extract<Draft, { type: T }>;

export function emptyDraft(item: Item): Draft {
  switch (item.type) {
    case 'mcq':
      return { type: 'mcq', option: null };
    case 'predict-output':
      return { type: 'predict-output', text: '' };
    case 'arrange-steps':
      return { type: 'arrange-steps', order: [] };
    case 'fill-blank':
      return { type: 'fill-blank', blanks: item.blanks.map(() => '') };
    case 'trace-table':
      return { type: 'trace-table', rows: tableWithGivens(item) };
    case 'truth-table':
      return { type: 'truth-table', rows: item.rows.map((row) => row.map(() => '' as const)) };
  }
}

function tableWithGivens(item: ItemOf<'trace-table'>): string[][] {
  const rows = item.rows.map((row) => row.map(() => ''));
  for (const [r, c] of item.given) rows[r]![c] = item.rows[r]![c]!;
  return rows;
}

export function isGiven(item: ItemOf<'trace-table'>, row: number, column: number): boolean {
  return item.given.some(([r, c]) => r === row && c === column);
}

/** The draft as a gradable answer, or null while something is still missing. */
export function toAnswer(item: Item, draft: Draft): Answer | null {
  switch (draft.type) {
    case 'mcq':
      return draft.option === null ? null : { type: 'mcq', option: draft.option };
    case 'predict-output':
      return draft.text.trim() === '' ? null : { type: 'predict-output', text: draft.text };
    case 'arrange-steps':
      return item.type === 'arrange-steps' && draft.order.length === arrangeCount(item)
        ? { type: 'arrange-steps', order: draft.order }
        : null;
    case 'fill-blank':
      return draft.blanks.every((b) => b.trim() !== '')
        ? { type: 'fill-blank', blanks: draft.blanks }
        : null;
    case 'trace-table':
      return draft.rows.every((row) => row.every((cell) => cell.trim() !== ''))
        ? { type: 'trace-table', rows: draft.rows }
        : null;
    case 'truth-table':
      return draft.rows.every((row) => row.every((cell) => cell !== ''))
        ? { type: 'truth-table', rows: draft.rows as ('true' | 'false')[][] }
        : null;
  }
}

/** Shows a correct answer in the inputs (after "Show me the answer"). */
export function draftFromAnswer(answer: Answer): Draft {
  return answer as AnswerOf<ItemType> as Draft;
}
