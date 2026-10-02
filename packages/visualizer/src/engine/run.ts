import { parseProgram, PseudoError, type Expr, type Stmt, type Value } from './parse';

/** What happened in one step. Renderers turn this into a caption. */
export type StepEvent =
  | { type: 'start' }
  | {
      type: 'assign';
      name: string;
      value: Value;
      previous: Value | undefined;
      work: string;
      /** Position written, for `list[i] = value`. */
      index: number | null;
    }
  | { type: 'say'; value: Value }
  | { type: 'loop-enter'; name: string; value: number; to: number }
  | { type: 'loop-exit'; name: string; value: number; to: number }
  | { type: 'each-enter'; name: string; value: Value; position: number; total: number }
  | { type: 'each-exit'; name: string; total: number }
  | { type: 'while-check'; condition: string; result: boolean }
  | { type: 'if-check'; condition: string; result: boolean }
  | { type: 'add'; name: string; value: Value; length: number }
  | { type: 'define'; name: string; params: string[] }
  | { type: 'call'; name: string; args: Value[]; params: string[] }
  | { type: 'return'; name: string; value: Value | null }
  | { type: 'end' };

/** A running function call and its own boxes. */
export interface StackFrame {
  name: string;
  vars: Record<string, Value>;
}

/** The full state after one step: deterministic, serialisable, renderer-agnostic. */
export interface Frame {
  index: number;
  /** 1-based source line that just ran (0 for start/end). */
  line: number;
  /** Top-level boxes. */
  vars: Record<string, Value>;
  /** Active function calls, outermost first. */
  stack: StackFrame[];
  output: string[];
  event: StepEvent;
  /** Box that changed in this step, for highlighting. */
  changed: string | null;
  /** List position that changed, if any. */
  changedIndex: number | null;
}

export const MAX_STEPS = 1000;
export const MAX_CALL_DEPTH = 50;

export class StepLimitError extends PseudoError {
  constructor(line: number) {
    super(line, `stopped after ${MAX_STEPS} steps: does this loop ever end?`);
    this.name = 'StepLimitError';
  }
}

export function formatValue(value: Value): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => (typeof v === 'string' ? `"${v}"` : formatValue(v))).join(', ')}]`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

const quoted = (value: Value) => (typeof value === 'string' ? `"${value}"` : formatValue(value));

const copy = (value: Value): Value => (Array.isArray(value) ? value.map(copy) : value);
const copyVars = (vars: Record<string, Value>) =>
  Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, copy(v)]));

export function valuesEqual(a: Value, b: Value): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => valuesEqual(v, b[i]!))
    );
  }
  return a === b;
}

/** Source text of an expression; with `vars`, names are replaced by their current values. */
export function exprText(expr: Expr, vars?: Record<string, Value>): string {
  switch (expr.kind) {
    case 'literal':
      return quoted(expr.value);
    case 'name': {
      const value = vars?.[expr.name];
      return value === undefined ? expr.name : quoted(value);
    }
    case 'list':
      return `[${expr.items.map((e) => exprText(e, vars)).join(', ')}]`;
    case 'index': {
      const target = expr.target.kind === 'name' ? expr.target.name : exprText(expr.target, vars);
      return `${target}[${exprText(expr.index, vars)}]`;
    }
    case 'call':
      return `${expr.name}(${expr.args.map((a) => exprText(a, vars)).join(', ')})`;
    case 'unary':
      return expr.op === 'not'
        ? `not ${exprText(expr.operand, vars)}`
        : `-${exprText(expr.operand, vars)}`;
    case 'binary': {
      const wrap = (e: Expr) =>
        e.kind === 'binary' ? `(${exprText(e, vars)})` : exprText(e, vars);
      return `${wrap(expr.left)} ${expr.op} ${wrap(expr.right)}`;
    }
  }
}

function number(v: Value, line: number): number {
  if (typeof v !== 'number') throw new PseudoError(line, `expected a number but got ${quoted(v)}`);
  return v;
}

function truthy(v: Value, line: number): boolean {
  if (typeof v !== 'boolean')
    throw new PseudoError(line, `expected true or false but got ${quoted(v)}`);
  return v;
}

function position(list: Value[] | string, index: Value, line: number): number {
  const i = number(index, line);
  if (!Number.isInteger(i)) throw new PseudoError(line, 'a position must be a whole number');
  if (i < 0 || i >= list.length) {
    const what = typeof list === 'string' ? 'text' : 'list';
    throw new PseudoError(
      line,
      list.length === 0
        ? `position ${i} does not exist: the ${what} is empty`
        : `position ${i} does not exist: the ${what} has ${list.length} items, positions 0 to ${list.length - 1}`,
    );
  }
  return i;
}

class ReturnSignal {
  constructor(readonly value: Value | null) {}
}

type FunctionDef = Extract<Stmt, { kind: 'define' }>;

/** Runs a program and records a frame after every step. */
export function run(source: string): Frame[] {
  const program = parseProgram(source);
  const globals: Record<string, Value> = {};
  const scopes: StackFrame[] = [];
  const functions = new Map<string, FunctionDef>();
  const output: string[] = [];
  const frames: Frame[] = [];

  const top = () => scopes.at(-1);
  const lookup = (name: string): Value | undefined => top()?.vars[name] ?? globals[name];
  const visible = (): Record<string, Value> => ({ ...globals, ...(top()?.vars ?? {}) });
  const store = (name: string, value: Value) => {
    const scope = top();
    if (scope) scope.vars[name] = value;
    else globals[name] = value;
  };

  const record = (
    line: number,
    event: StepEvent,
    changed: string | null = null,
    changedIndex: number | null = null,
  ) => {
    if (frames.length >= MAX_STEPS) throw new StepLimitError(line);
    frames.push({
      index: frames.length,
      line,
      vars: copyVars(globals),
      stack: scopes.map((s) => ({ name: s.name, vars: copyVars(s.vars) })),
      output: [...output],
      event,
      changed,
      changedIndex,
    });
  };

  const callFunction = (name: string, args: Value[], line: number): Value | null => {
    const fn = functions.get(name);
    if (!fn) throw new PseudoError(line, `there is no function called "${name}"`);
    if (args.length !== fn.params.length) {
      throw new PseudoError(
        line,
        `${name} needs ${fn.params.length} input(s) but got ${args.length}`,
      );
    }
    if (scopes.length >= MAX_CALL_DEPTH) {
      throw new PseudoError(
        line,
        `too many calls inside calls (more than ${MAX_CALL_DEPTH}): does it ever stop?`,
      );
    }
    scopes.push({ name, vars: Object.fromEntries(fn.params.map((p, i) => [p, copy(args[i]!)])) });
    record(line, { type: 'call', name, args: args.map(copy), params: fn.params });
    let result: Value | null = null;
    try {
      exec(fn.body);
      record(fn.line, { type: 'return', name, value: null });
    } catch (signal) {
      if (!(signal instanceof ReturnSignal)) throw signal;
      result = signal.value;
    } finally {
      scopes.pop();
    }
    return result;
  };

  const evaluate = (expr: Expr, line: number): Value => {
    switch (expr.kind) {
      case 'literal':
        return expr.value;
      case 'name': {
        const value = lookup(expr.name);
        if (value === undefined) {
          if (functions.has(expr.name))
            throw new PseudoError(line, `${expr.name} is a function: call it with ( )`);
          throw new PseudoError(line, `"${expr.name}" has no value yet`);
        }
        return value;
      }
      case 'list':
        return expr.items.map((item) => copy(evaluate(item, line)));
      case 'index': {
        const target = evaluate(expr.target, line);
        if (typeof target === 'string')
          return target[position(target, evaluate(expr.index, line), line)]!;
        if (!Array.isArray(target))
          throw new PseudoError(line, `only lists and text have positions, not ${quoted(target)}`);
        return copy(target[position(target, evaluate(expr.index, line), line)]!);
      }
      case 'call': {
        if (expr.name === 'len') {
          if (expr.args.length !== 1) throw new PseudoError(line, 'len needs exactly one input');
          const value = evaluate(expr.args[0]!, line);
          if (typeof value === 'string' || Array.isArray(value)) return value.length;
          throw new PseudoError(line, `len works on lists and text, not ${quoted(value)}`);
        }
        if (expr.name === 'add')
          throw new PseudoError(line, 'add changes a list: use it on its own line');
        const result = callFunction(
          expr.name,
          expr.args.map((a) => evaluate(a, line)),
          line,
        );
        if (result === null) throw new PseudoError(line, `${expr.name} does not return a value`);
        return result;
      }
      case 'unary': {
        const v = evaluate(expr.operand, line);
        if (expr.op === 'not') return !truthy(v, line);
        return -number(v, line);
      }
      case 'binary': {
        if (expr.op === 'and')
          return (
            truthy(evaluate(expr.left, line), line) && truthy(evaluate(expr.right, line), line)
          );
        if (expr.op === 'or')
          return (
            truthy(evaluate(expr.left, line), line) || truthy(evaluate(expr.right, line), line)
          );
        const l = evaluate(expr.left, line);
        const r = evaluate(expr.right, line);
        switch (expr.op) {
          case '+':
            if (Array.isArray(l) || Array.isArray(r))
              throw new PseudoError(line, 'use add(list, value) to grow a list');
            if (typeof l === 'string' || typeof r === 'string')
              return formatValue(l) + formatValue(r);
            return number(l, line) + number(r, line);
          case '-':
            return number(l, line) - number(r, line);
          case '*':
            return number(l, line) * number(r, line);
          case '/': {
            const divisor = number(r, line);
            if (divisor === 0) throw new PseudoError(line, 'cannot divide by 0');
            return number(l, line) / divisor;
          }
          case '%':
            return number(l, line) % number(r, line);
          case '==':
            return valuesEqual(l, r);
          case '!=':
            return !valuesEqual(l, r);
          case '<':
            return number(l, line) < number(r, line);
          case '<=':
            return number(l, line) <= number(r, line);
          case '>':
            return number(l, line) > number(r, line);
          case '>=':
            return number(l, line) >= number(r, line);
        }
      }
    }
  };

  const exec = (stmts: Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'assign': {
          const work = exprText(stmt.expr, visible());
          const value = evaluate(stmt.expr, stmt.line);
          if (stmt.index) {
            const list = lookup(stmt.name);
            if (list === undefined)
              throw new PseudoError(stmt.line, `"${stmt.name}" has no value yet`);
            if (!Array.isArray(list))
              throw new PseudoError(stmt.line, `${stmt.name} is not a list`);
            const i = position(list, evaluate(stmt.index, stmt.line), stmt.line);
            const previous = list[i];
            const updated = list.map(copy);
            updated[i] = copy(value);
            store(stmt.name, updated);
            record(
              stmt.line,
              { type: 'assign', name: stmt.name, value: copy(value), previous, work, index: i },
              stmt.name,
              i,
            );
          } else {
            const previous = lookup(stmt.name);
            store(stmt.name, copy(value));
            record(
              stmt.line,
              { type: 'assign', name: stmt.name, value: copy(value), previous, work, index: null },
              stmt.name,
            );
          }
          break;
        }
        case 'say': {
          const value = evaluate(stmt.expr, stmt.line);
          output.push(formatValue(value));
          record(stmt.line, { type: 'say', value: copy(value) });
          break;
        }
        case 'for': {
          const from = number(evaluate(stmt.from, stmt.line), stmt.line);
          const to = number(evaluate(stmt.to, stmt.line), stmt.line);
          let i = from;
          while (i <= to) {
            store(stmt.name, i);
            record(stmt.line, { type: 'loop-enter', name: stmt.name, value: i, to }, stmt.name);
            exec(stmt.body);
            i++;
          }
          record(stmt.line, { type: 'loop-exit', name: stmt.name, value: i, to });
          break;
        }
        case 'foreach': {
          const list = evaluate(stmt.list, stmt.line);
          const items = typeof list === 'string' ? [...list] : list;
          if (!Array.isArray(items))
            throw new PseudoError(
              stmt.line,
              `"for each" needs a list or text, not ${quoted(list)}`,
            );
          items.forEach((item, position) => {
            store(stmt.name, copy(item));
            record(
              stmt.line,
              {
                type: 'each-enter',
                name: stmt.name,
                value: copy(item),
                position,
                total: items.length,
              },
              stmt.name,
            );
            exec(stmt.body);
          });
          record(stmt.line, { type: 'each-exit', name: stmt.name, total: items.length });
          break;
        }
        case 'while': {
          for (;;) {
            const condition = exprText(stmt.cond, visible());
            const result = truthy(evaluate(stmt.cond, stmt.line), stmt.line);
            record(stmt.line, { type: 'while-check', condition, result });
            if (!result) break;
            exec(stmt.body);
          }
          break;
        }
        case 'if': {
          const condition = exprText(stmt.cond, visible());
          const result = truthy(evaluate(stmt.cond, stmt.line), stmt.line);
          record(stmt.line, { type: 'if-check', condition, result });
          if (result) exec(stmt.then);
          else if (stmt.otherwise) exec(stmt.otherwise);
          break;
        }
        case 'define': {
          functions.set(stmt.name, stmt);
          record(stmt.line, { type: 'define', name: stmt.name, params: stmt.params });
          break;
        }
        case 'return': {
          const value = stmt.expr ? evaluate(stmt.expr, stmt.line) : null;
          record(stmt.line, {
            type: 'return',
            name: top()!.name,
            value: value === null ? null : copy(value),
          });
          throw new ReturnSignal(value);
        }
        case 'call': {
          const { name, args } = stmt.expr;
          if (name === 'add') {
            if (args.length !== 2 || args[0]!.kind !== 'name') {
              throw new PseudoError(stmt.line, 'use add like this: add(listName, value)');
            }
            const listName = args[0]!.name;
            const list = lookup(listName);
            if (!Array.isArray(list)) throw new PseudoError(stmt.line, `${listName} is not a list`);
            const value = evaluate(args[1]!, stmt.line);
            const updated = [...list.map(copy), copy(value)];
            store(listName, updated);
            record(
              stmt.line,
              { type: 'add', name: listName, value: copy(value), length: updated.length },
              listName,
              updated.length - 1,
            );
          } else if (name === 'len') {
            throw new PseudoError(
              stmt.line,
              'len gives a value: use it in a line like say len(nums)',
            );
          } else {
            callFunction(
              name,
              args.map((a) => evaluate(a, stmt.line)),
              stmt.line,
            );
          }
          break;
        }
      }
    }
  };

  record(0, { type: 'start' });
  exec(program);
  record(0, { type: 'end' });
  return frames;
}

/** Everything the program showed with `say`. */
export function outputOf(source: string): string[] {
  return run(source).at(-1)!.output;
}

/** Final top-level boxes. */
export function finalVars(source: string): Record<string, Value> {
  return run(source).at(-1)!.vars;
}

/**
 * Trace-table rows: the value of each column every time `line` finishes running.
 * Names are looked up in the current function call first, then at the top level.
 */
export function traceRows(
  frames: Frame[],
  line: number,
  columns: readonly string[],
): (string | null)[][] {
  return frames
    .filter(
      (frame) =>
        frame.line === line &&
        frame.event.type !== 'loop-exit' &&
        frame.event.type !== 'each-exit' &&
        frame.event.type !== 'return' &&
        frame.event.type !== 'define',
    )
    .map((frame) =>
      columns.map((column) => {
        const value = frame.stack.at(-1)?.vars[column] ?? frame.vars[column];
        return value === undefined ? null : formatValue(value);
      }),
    );
}

/** Evaluates a standalone expression with given boxes (used for truth tables). */
export function evaluateExpression(expression: string, vars: Record<string, Value>): Value {
  const assignments = Object.entries(vars)
    .map(([k, v]) => `${k} = ${quoted(v)}`)
    .join('\n');
  const frames = run(`${assignments}\nresult__ = ${expression}`);
  return frames.at(-1)!.vars.result__!;
}
