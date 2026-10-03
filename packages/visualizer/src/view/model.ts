import type { Locale } from '../engine/captions';

/**
 * What the player draws, whatever ran the program (our pseudocode engine or real Python).
 * Plain data, so a trace can cross a Worker boundary or be saved.
 */
export type ViewValue =
  | { kind: 'atom'; text: string; type: 'number' | 'string' | 'boolean' | 'none' | 'other' }
  | {
      kind: 'seq';
      type: 'list' | 'tuple' | 'set';
      items: ViewValue[];
      /** Same ref = same object in memory (Python), so marks show on every name for it. */
      ref?: string;
      /** Items beyond this many were left out. */
      more?: number;
    }
  | {
      kind: 'dict';
      entries: [ViewValue, ViewValue][];
      ref?: string;
      more?: number;
      /** Class name, for an object shown by its fields. */
      label?: string;
    };

export interface ViewBox {
  name: string;
  value: ViewValue;
}

export interface ViewScope {
  name: string;
  boxes: ViewBox[];
}

/** How one list cell looks right now (the find_paper look: current, checked, found). */
export interface CellMark {
  /** Variable names pointing at this position (e.g. "p", "i", "mid"). */
  pointers?: string[];
  /** current = being looked at; miss = just compared, not equal; found = compared, equal. */
  state?: 'current' | 'miss' | 'found';
  /** Already looked at earlier in this loop. */
  seen?: boolean;
}

export interface ViewFrame {
  index: number;
  /** 1-based line that just ran (0 = before the start / after the end). */
  line: number;
  globals: ViewBox[];
  /** Active function calls, outermost first. */
  stack: ViewScope[];
  output: string[];
  /** Something was printed in this step (the newest line pops). */
  printed: boolean;
  caption: Record<Locale, string>;
  /** Box that changed in this step: depth -1 = top level, 0.. = function call. */
  changed: { depth: number; name: string } | null;
  changedIndex: number | null;
  /** Cell marks by box key (see boxKey). */
  marks: Record<string, Record<number, CellMark>>;
  /** Conditions checked so far (if / while / elif). */
  checks: number;
  /** The program stopped with this message on this frame. */
  error?: Record<Locale, string>;
}

export const boxKey = (depth: number, name: string) => `${depth}:${name}`;

export function viewText(value: ViewValue, quoteStrings = false): string {
  switch (value.kind) {
    case 'atom':
      return quoteStrings && value.type === 'string' ? `"${value.text}"` : value.text;
    case 'seq': {
      const inner = value.items.map((v) => viewText(v, true));
      if (value.more) inner.push('…');
      const [open, close] =
        value.type === 'tuple' ? ['(', ')'] : value.type === 'set' ? ['{', '}'] : ['[', ']'];
      return `${open}${inner.join(', ')}${close}`;
    }
    case 'dict': {
      const inner = value.entries.map(([k, v]) => `${viewText(k, true)}: ${viewText(v, true)}`);
      if (value.more) inner.push('…');
      return value.label
        ? `${value.label}(${value.entries.map(([k, v]) => `${k.kind === 'atom' ? k.text : viewText(k)}=${viewText(v, true)}`).join(', ')})`
        : `{${inner.join(', ')}}`;
    }
  }
}

export function sameView(a: ViewValue | undefined, b: ViewValue | undefined): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && viewText(a, true) === viewText(b, true);
}
