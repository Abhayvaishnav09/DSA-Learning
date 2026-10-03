import type { Locale } from '../engine/captions';
import { markCells, type IndexVars, type StepHints } from '../view/marks';
import type { Derived } from './verdict';
import {
  sameView,
  viewText,
  type ViewBox,
  type ViewFrame,
  type ViewScope,
  type ViewValue,
} from '../view/model';

/** What tracer.ts sends back (one JSON string). */
export interface RawState {
  globals: ViewBox[];
  stack: ViewScope[];
  output: string[];
}

export interface RawEvent extends RawState {
  kind: 'line' | 'call' | 'return';
  line: number;
  func: string;
  stmt?: { kind: string; name?: string };
  check?: {
    text: string;
    valued: string;
    names: string[];
    kind: 'if' | 'while';
    result: boolean | null;
  };
  loop?: {
    vars: string[];
    position: number;
    done: boolean;
    total?: number;
    list?: string;
    mode?: 'items' | 'range';
    ref?: string;
    item?: ViewValue;
  };
  /** Lines of the loop or if body this event belongs to. */
  body?: [number, number];
  value?: ViewValue;
  callerLine?: number;
}

export interface RawError {
  type: string;
  message: string;
  line: number;
}

export interface RawTrace {
  events: RawEvent[];
  final?: RawState;
  error: RawError | null;
  indexVars?: IndexVars;
  /** Algorithms recognised from the code's shape (detect.ts). */
  algorithms?: Recognised[];
  /** Big-O worked out from the code's shape (derive.ts). */
  derived?: Derived | null;
}

export interface Recognised {
  id: string;
  /** Function it is in ("" = top level). */
  fn: string;
  /** Binary search: the names of its bounds and its list. */
  lo?: string;
  hi?: string;
  mid?: string;
  list?: string;
  inclusive?: boolean;
}

type Both = Record<Locale, string>;
const both = (en: string, hi: string): Both => ({ en, 'hi-Latn': hi });
const join = (...parts: (Both | null)[]): Both => {
  const kept = parts.filter((p): p is Both => p !== null);
  return both(kept.map((p) => p.en).join(' '), kept.map((p) => p['hi-Latn']).join(' '));
};

const shown = (v: ViewValue) => viewText(v, true);
const EMPTY: RawState = { globals: [], stack: [], output: [] };

/** The innermost scope's boxes (the running function, else the top level). */
const innermost = (s: RawState) => s.stack.at(-1)?.boxes ?? s.globals;

interface Change {
  name: string;
  before: ViewValue | undefined;
  after: ViewValue;
  index: number | null;
  /** Two positions that traded values. */
  swap?: [number, number];
}

/** What changed between two states, in the scope that is running after the step. */
function changes(before: RawState, after: RawState): { depth: number; list: Change[] } {
  const depth = after.stack.length - 1;
  const old =
    depth === before.stack.length - 1 &&
    (depth === -1 || before.stack[depth]?.name === after.stack[depth]?.name)
      ? innermost(before)
      : depth === -1
        ? before.globals
        : [];
  const list: Change[] = [];
  for (const box of innermost(after)) {
    const prev = old.find((b) => b.name === box.name)?.value;
    if (sameView(prev, box.value)) continue;
    let index: number | null = null;
    if (prev?.kind === 'seq' && box.value.kind === 'seq') {
      const a = prev.items;
      const b = box.value.items;
      if (b.length > a.length) index = b.length - 1;
      else index = b.findIndex((item, i) => !sameView(item, a[i]));
      if (index < 0) index = null;
      const moved = b.flatMap((item, i) => (sameView(item, a[i]) ? [] : [i]));
      if (a.length === b.length && moved.length === 2) {
        const [i, j] = moved as [number, number];
        if (sameView(a[i], b[j]) && sameView(a[j], b[i])) {
          list.push({ name: box.name, before: prev, after: box.value, index: i, swap: [i, j] });
          continue;
        }
      }
    }
    list.push({ name: box.name, before: prev, after: box.value, index });
  }
  return { depth, list };
}

function describeChanges(list: Change[]): Both | null {
  if (!list.length) return null;
  const parts = list.slice(0, 3).map((c) => {
    if (c.before === undefined)
      return both(
        `Make a box called ${c.name} and put ${shown(c.after)} in it.`,
        `${c.name} naam ka box banao aur usme ${shown(c.after)} rakho.`,
      );
    if (c.swap && c.before?.kind === 'seq') {
      const [i, j] = c.swap;
      const x = shown(c.before.items[i]!);
      const y = shown(c.before.items[j]!);
      return both(
        `Swap: ${c.name}[${i}] and ${c.name}[${j}] trade places (${x} ↔ ${y}).`,
        `Swap: ${c.name}[${i}] aur ${c.name}[${j}] ki jagah badal gayi (${x} ↔ ${y}).`,
      );
    }
    if (c.index !== null && c.after.kind === 'seq') {
      const item = c.after.items[c.index]!;
      return both(
        `${c.name}[${c.index}] is now ${shown(item)}.`,
        `${c.name}[${c.index}] ab ${shown(item)} hai.`,
      );
    }
    return both(
      `${c.name} changes from ${shown(c.before)} to ${shown(c.after)}. The old value is gone.`,
      `${c.name} ${shown(c.before)} se badal kar ${shown(c.after)} ho gaya. Purani value chali gayi.`,
    );
  });
  if (list.length > 3) parts.push(both(`(+${list.length - 3} more)`, `(+${list.length - 3} aur)`));
  return join(...parts);
}

function describeLine(event: RawEvent, next: RawEvent | undefined, after: RawState): Both | null {
  const { check, loop, stmt } = event;
  if (check) {
    const what = check.valued !== check.text ? `${check.text}  →  ${check.valued}` : check.text;
    if (check.result === null) return both(`Check ${what}.`, `${what} check karo.`);
    if (check.kind === 'while')
      return check.result
        ? both(
            `Is ${what}? Yes (True), so run the loop lines again.`,
            `Kya ${what}? Haan (True), isliye loop ki lines phir chalao.`,
          )
        : both(
            `Is ${what}? No (False), so the loop stops.`,
            `Kya ${what}? Nahi (False), isliye loop ruk gaya.`,
          );
    return check.result
      ? both(
          `Is ${what}? Yes (True), so run the lines inside "if".`,
          `Kya ${what}? Haan (True), isliye "if" ke andar ki lines chalao.`,
        )
      : both(
          `Is ${what}? No (False), so skip the "if" lines.`,
          `Kya ${what}? Nahi (False), isliye "if" ki lines chhod do.`,
        );
  }
  if (loop) {
    if (loop.done)
      return loop.total !== undefined
        ? both(
            `No items left (all ${loop.total} done). The loop stops.`,
            `Koi item nahi bacha (saare ${loop.total} ho gaye). Loop ruk gaya.`,
          )
        : both('The loop is over. Carry on after it.', 'Loop khatam. Ab loop ke baad wali line.');
    const k = loop.position;
    const vars = loop.vars.join(', ');
    if (loop.list && loop.mode === 'items' && loop.item && loop.total !== undefined)
      return both(
        `Next round: ${vars} = ${loop.list}[${k}] = ${shown(loop.item)} (item ${k + 1} of ${loop.total}).`,
        `Loop ka agla round: ${vars} = ${loop.list}[${k}] = ${shown(loop.item)} (${loop.total} me se item ${k + 1}).`,
      );
    if (loop.list && loop.total !== undefined)
      return both(
        `Next round: ${vars} = ${k} (round ${k + 1} of ${loop.total}).`,
        `Loop ka agla round: ${vars} = ${k} (${loop.total} me se round ${k + 1}).`,
      );
    const value = innermost(after).find((b) => b.name === loop.vars[0])?.value;
    return value
      ? both(
          `Next round: ${loop.vars[0]} is now ${shown(value)}.`,
          `Loop ka agla round: ${loop.vars[0]} ab ${shown(value)} hai.`,
        )
      : both('Next round of the loop.', 'Loop ka agla round.');
  }
  if (next?.kind === 'call' && next.stack.length) {
    const fn = next.stack.at(-1)!;
    const args = fn.boxes.map((b) => `${b.name} = ${shown(b.value)}`).join(', ');
    return args
      ? both(
          `Call ${fn.name}() with ${args}. It gets its own boxes.`,
          `${fn.name}() call hua: ${args}. Iske apne alag box hain.`,
        )
      : both(
          `Call ${fn.name}(). It gets its own boxes.`,
          `${fn.name}() call hua. Iske apne alag box hain.`,
        );
  }
  switch (stmt?.kind) {
    case 'def':
      return both(
        `Remember the steps of ${stmt.name}() for later. Nothing runs yet.`,
        `${stmt.name}() ke steps baad ke liye yaad rakho. Abhi kuch nahi chalta.`,
      );
    case 'class':
      return both(
        `Remember the class ${stmt.name} for later.`,
        `Class ${stmt.name} baad ke liye yaad rakho.`,
      );
    case 'Return':
      return next?.kind === 'return' && next.value
        ? both(
            `return ${shown(next.value)}: ${event.func}() gives back ${shown(next.value)}.`,
            `return ${shown(next.value)}: ${event.func}() ne ${shown(next.value)} wapas diya.`,
          )
        : null;
    case 'Break':
      return both('break: leave the loop now.', 'break: loop abhi chhod do.');
    case 'Continue':
      return both('continue: skip to the next round.', 'continue: seedha agle round par jao.');
    case 'Pass':
      return both('pass: do nothing.', 'pass: kuch nahi karna.');
    case 'Import':
    case 'ImportFrom':
      return both('Load a module.', 'Module load karo.');
    default:
      return null;
  }
}

function describeOutput(before: RawState, after: RawState): Both | null {
  let start = before.output.length;
  // print(..., end="") keeps writing on the same screen line.
  if (start > 0 && after.output[start - 1] !== before.output[start - 1]) start--;
  const printed = after.output.slice(start);
  if (!printed.length) return null;
  const text = printed.map((l) => `"${l}"`).join(', ');
  return both(`Show ${text} on the screen.`, `Screen par ${text} dikhao.`);
}

/** Friendly words for the errors beginners meet most. */
export function describeError(error: RawError): Both {
  const at = error.line ? both(`Line ${error.line}:`, `Line ${error.line} par:`) : null;
  const raw = `${error.type}: ${error.message}`;
  const hint: Record<string, Both> = {
    SyntaxError: both(
      `the code is not valid Python (${error.message}). Check brackets, colons and indentation.`,
      `code sahi Python nahi hai (${error.message}). Brackets, colon (:) aur indentation check karo.`,
    ),
    IndentationError: both(
      `the indentation is wrong (${error.message}).`,
      `indentation (aage ki khaali jagah) galat hai (${error.message}).`,
    ),
    NameError: both(
      `${raw}. This name has no value yet: is it spelled right, and is it set before this line?`,
      `${raw}. Is naam ki abhi koi value nahi: spelling sahi hai? Is line se pehle bana hai?`,
    ),
    IndexError: both(
      `${raw}. That position does not exist in the list.`,
      `${raw}. List me yeh position hai hi nahi.`,
    ),
    ZeroDivisionError: both(
      `${raw}. A number cannot be divided by 0.`,
      `${raw}. Kisi number ko 0 se divide nahi kar sakte.`,
    ),
    TypeError: both(
      `${raw}. The values are of the wrong kind for this operation.`,
      `${raw}. Is kaam ke liye values galat type ki hain.`,
    ),
    EOFError: both(
      'input() needs a value. Type one per line in the Input box and run again.',
      'input() ko value chahiye. Input box me har value alag line me likho aur phir chalao.',
    ),
    StepLimit: both(
      `stopped after ${error.message} steps. Does this loop ever end?`,
      `${error.message} steps ke baad rok diya. Kya yeh loop kabhi khatam hota hai?`,
    ),
    Timeout: both(
      'the program took too long (more than 5 seconds) and was stopped.',
      'program bahut der (5 second se zyada) chala, isliye rok diya.',
    ),
  };
  return join(at, hint[error.type] ?? both(raw, raw));
}

const intOf = (boxes: ViewBox[], name: string | undefined) => {
  const v = boxes.find((b) => b.name === name)?.value;
  return v?.kind === 'atom' && v.type === 'number' && /^-?\d+$/.test(v.text)
    ? Number(v.text)
    : null;
};

const lengthOf = (boxes: ViewBox[], name: string | undefined) => {
  const v = boxes.find((b) => b.name === name)?.value;
  return v?.kind === 'seq' ? v.items.length + (v.more ?? 0) : null;
};

/** One more sentence for a caption, when there is one. */
const add = (caption: Both | null, note: Both | null) =>
  caption && note ? join(caption, note) : (caption ?? note);

/**
 * Turns a raw trace into player frames. Like the pseudocode player, each frame shows the line
 * that just ran with the state after it, so "x = 5" and the box holding 5 appear together.
 */
export function framesFromTrace(trace: RawTrace, source = ''): ViewFrame[] {
  const sourceLines = source.split('\n');
  const events = trace.events.filter((e) => !(e.func === '<module>' && e.kind !== 'line'));
  const final = trace.final ?? events.at(-1) ?? EMPTY;
  const stateAfter = (i: number): RawState => events[i + 1] ?? final;

  const hints: StepHints[] = [{}];
  let checks = 0;
  // The loop each function is in, for "stopped early: the rest were never checked".
  const looping = new Map<string, { position: number; total?: number; body: [number, number] }>();
  const searches = (trace.algorithms ?? []).filter((a) => a.id === 'binary-search');
  const areas = new Map<string, number>();
  const areaOf = (search: Recognised, boxes: ViewBox[]) => {
    const lo = intOf(boxes, search.lo);
    const hi = intOf(boxes, search.hi);
    if (lo === null || hi === null) return null;
    return { lo, hi, size: Math.max(0, hi - lo + (search.inclusive ? 1 : 0)) };
  };
  const frames: Omit<ViewFrame, 'marks'>[] = [
    {
      index: 0,
      line: 0,
      globals: [],
      stack: [],
      output: [],
      printed: false,
      caption: both(
        'Ready. Press play or step forward to run the program one line at a time.',
        'Taiyaar. Play dabao ya ek-ek line aage badho.',
      ),
      changed: null,
      changedIndex: null,
      checks: 0,
    },
  ];

  const push = (
    line: number,
    before: RawState,
    after: RawState,
    caption: Both | null,
    hint: StepHints,
    { describeChanged = true } = {},
  ) => {
    const { depth, list } = changes(before, after);
    const said = describeOutput(before, after);
    const parts = [caption, describeChanged && !hint.check ? describeChanges(list) : null, said];
    const code = sourceLines[line - 1]?.trim();
    const text = parts.some(Boolean)
      ? join(...parts)
      : code
        ? both(`Run ${code}. No box changed.`, `${code} chalao. Kisi box ki value nahi badli.`)
        : both(`Run line ${line}.`, `Line ${line} chalao.`);
    frames.push({
      index: frames.length,
      line,
      globals: after.globals,
      stack: after.stack,
      output: after.output,
      printed: said !== null,
      caption: text,
      changed: list[0] ? { depth, name: list[0].name } : null,
      changedIndex: list[0]?.index ?? null,
      checks,
    });
    hints.push(hint);
  };

  events.forEach((event, i) => {
    const after = stateAfter(i);
    const next = events[i + 1];
    if (event.kind === 'line') {
      const hint: StepHints = {};
      if (event.check) {
        checks++;
        if (event.check.result !== null)
          hint.check = { names: event.check.names, result: event.check.result };
      }
      const loop = event.loop;
      if (loop?.ref && loop.total !== undefined)
        hint.iter = {
          list: `ref:${loop.ref}`,
          vars: loop.vars,
          position: loop.done ? loop.total : loop.position,
          total: loop.total,
        };
      let note: Both | null = null;
      if (loop && event.body) {
        if (loop.done) looping.delete(event.func);
        else
          looping.set(event.func, { position: loop.position, total: loop.total, body: event.body });
      }
      const exit = event.stmt?.kind;
      const inLoop = looping.get(event.func);
      if ((exit === 'Return' || exit === 'Break') && inLoop) {
        looping.delete(event.func);
        const rest = inLoop.total === undefined ? 0 : inLoop.total - inLoop.position - 1;
        if (rest > 0 && event.line >= inLoop.body[0] && event.line <= inLoop.body[1])
          note = both(
            `The loop stops early: only ${inLoop.position + 1} of ${inLoop.total} items were checked (${checks} ${checks === 1 ? 'comparison' : 'comparisons'}); the other ${rest} were never looked at.`,
            `Loop beech me hi ruk gaya: ${inLoop.total} me se sirf ${inLoop.position + 1} item check hue (${checks} comparison lage), baaki ${rest} check hi nahi hue.`,
          );
      }
      for (const search of searches.filter(
        (s) => s.fn === (event.func === '<module>' ? '' : event.func),
      )) {
        const boxes = innermost(after);
        const area = areaOf(search, boxes);
        const total = lengthOf(boxes, search.list);
        if (!area || total === null) continue;
        const names = [search.lo, search.hi];
        if (event.check?.kind === 'while' && names.every((n) => event.check!.names.includes(n!))) {
          areas.set(search.fn, area.size);
          if (event.check.result)
            note = add(
              note,
              both(
                `Search area: ${search.list}[${area.lo}..${area.hi}], ${area.size} of ${total} items left.`,
                `Search area: ${search.list}[${area.lo}..${area.hi}], ${total} me se ${area.size} item bache.`,
              ),
            );
        } else if (!event.check) {
          const before = areaOf(search, innermost(event));
          const was = areas.get(search.fn);
          if (
            before &&
            was !== undefined &&
            (before.lo !== area.lo || before.hi !== area.hi) &&
            area.size < was
          ) {
            areas.set(search.fn, area.size);
            note = add(
              note,
              both(
                `Half thrown away: the search area goes from ${was} to ${area.size} items.`,
                `Aadha hissa chhod diya: search area ${was} se ${area.size} item ka ho gaya.`,
              ),
            );
          }
        }
      }
      push(event.line, event, after, add(describeLine(event, next, after), note), hint, {
        describeChanged: next?.kind !== 'call' && !event.loop,
      });
    } else if (event.kind === 'return' && event.callerLine) {
      const value = event.value ? shown(event.value) : 'None';
      push(
        event.callerLine,
        event,
        after,
        both(
          `Back from ${event.func}() with ${value}.`,
          `${event.func}() se ${value} le kar wapas aaye.`,
        ),
        {},
      );
    }
  });

  const error = trace.error;
  frames.push({
    index: frames.length,
    line: error?.line ?? 0,
    globals: final.globals,
    stack: error ? (events.at(-1)?.stack ?? []) : [],
    output: final.output,
    printed: false,
    caption: error
      ? describeError(error)
      : both('The program has finished.', 'Program khatam ho gaya.'),
    changed: null,
    changedIndex: null,
    checks,
    ...(error ? { error: describeError(error) } : {}),
  });
  hints.push({});
  return markCells(frames, hints, trace.indexVars ?? {});
}
