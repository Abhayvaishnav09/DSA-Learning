import { boxKey, type CellMark, type ViewBox, type ViewFrame, type ViewValue } from './model';

/** What the program did in a step, as far as list cells care. */
export interface StepHints {
  /** A `for` loop over a list moved to `position` (position >= total: the loop is done). */
  iter?: { list: string; vars: string[]; position: number; total: number };
  /** A condition was checked: the names it reads and whether it was true. */
  check?: { names: string[]; result: boolean };
}

/** `list[var]` positions to label: list box name -> variable names, per function ("" = top level). */
export type IndexVars = Record<string, Record<string, string[]>>;

interface Memory {
  current: number | null;
  vars: string[];
  seenUpTo: number;
  state: 'miss' | 'found' | null;
  found: Set<number>;
}

type Unmarked = Omit<ViewFrame, 'marks'>;

/** A list's identity: its object when known (Python), otherwise its name (pseudocode). */
const listId = (box: ViewBox) =>
  box.value.kind === 'seq' && box.value.ref ? `ref:${box.value.ref}` : `name:${box.name}`;

/** Scopes from innermost (the running code) out to the top level. */
function scopes(frame: Unmarked): { depth: number; fn: string; boxes: ViewBox[] }[] {
  const calls = frame.stack.map((s, depth) => ({ depth, fn: s.name, boxes: s.boxes })).reverse();
  return [...calls, { depth: -1, fn: '', boxes: frame.globals }];
}

const intValue = (value: ViewValue | undefined) =>
  value?.kind === 'atom' && value.type === 'number' && /^-?\d+$/.test(value.text)
    ? Number(value.text)
    : null;

/**
 * Turns per-step hints into the find_paper look: the cell being looked at, cells already
 * looked at, the result of comparing it, and labels for index variables like i or mid.
 */
export function markCells(frames: Unmarked[], hints: StepHints[], indexVars: IndexVars) {
  const memory = new Map<string, Memory>();

  return frames.map((frame, step): ViewFrame => {
    const hint = hints[step] ?? {};
    // Index labels from the running scope only: list id -> position -> variable names.
    const labels = new Map<string, Map<number, string[]>>();
    const running = scopes(frame)[0]!;
    const pairs = indexVars[running.fn] ?? {};
    for (const [listName, vars] of Object.entries(pairs)) {
      const box = running.boxes.find((b) => b.name === listName);
      if (!box || box.value.kind !== 'seq') continue;
      const length = box.value.items.length;
      for (const name of vars) {
        const at = intValue(running.boxes.find((b) => b.name === name)?.value);
        if (at === null || at < 0 || at >= length) continue;
        const id = listId(box);
        const byPos = labels.get(id) ?? new Map<number, string[]>();
        byPos.set(at, [...(byPos.get(at) ?? []), name]);
        labels.set(id, byPos);
        // `if arr[mid] == target`: the compared cell shows the result too.
        if (hint.check?.names.includes(name)) {
          const mem = memory.get(id) ?? fresh();
          if (hint.check.result) mem.found.add(at);
          memory.set(id, mem);
        }
      }
    }

    if (hint.iter) {
      const { list, vars, position, total } = hint.iter;
      const previous = memory.get(list);
      const mem = position === 0 || !previous ? fresh() : previous;
      mem.current = position < total ? position : null;
      mem.seenUpTo = Math.min(position, total);
      mem.vars = vars;
      mem.state = null;
      memory.set(list, mem);
    }
    if (hint.check) {
      for (const mem of memory.values()) {
        if (mem.current === null || !mem.vars.some((v) => hint.check!.names.includes(v))) continue;
        mem.state = hint.check.result ? 'found' : 'miss';
        if (hint.check.result) mem.found.add(mem.current);
      }
    }

    const marks: ViewFrame['marks'] = {};
    const markBox = (depth: number, box: ViewBox) => {
      if (box.value.kind !== 'seq') return;
      const id = listId(box);
      const mem = memory.get(id);
      const byPos = labels.get(id);
      const cells: Record<number, CellMark> = {};
      box.value.items.forEach((_, i) => {
        const cell: CellMark = {};
        if (mem) {
          if (mem.current === i) {
            cell.state = mem.state ?? 'current';
            cell.pointers = [...mem.vars];
          } else if (mem.found.has(i)) cell.state = 'found';
          else if (i < mem.seenUpTo) cell.seen = true;
        }
        const named = byPos?.get(i);
        if (named) {
          cell.pointers = [...new Set([...(cell.pointers ?? []), ...named])];
        }
        if (cell.state || cell.seen || cell.pointers) cells[i] = cell;
      });
      if (Object.keys(cells).length) marks[boxKey(depth, box.name)] = cells;
    };
    frame.globals.forEach((box) => markBox(-1, box));
    frame.stack.forEach((scope, depth) => scope.boxes.forEach((box) => markBox(depth, box)));
    return { ...frame, marks };
  });
}

function fresh(): Memory {
  return { current: null, vars: [], seenUpTo: 0, state: null, found: new Set() };
}
