import { parseProgram, PseudoError, type Expr, type Stmt, type Value } from './parse';

/** What happened in one step. Renderers turn this into a caption. */
export type StepEvent =
  | { type: 'start' }
  | { type: 'assign'; name: string; value: Value; previous: Value | undefined; work: string }
  | { type: 'say'; value: Value }
  | { type: 'loop-enter'; name: string; value: number; to: number }
  | { type: 'loop-exit'; name: string; value: number; to: number }
  | { type: 'while-check'; condition: string; result: boolean }
  | { type: 'if-check'; condition: string; result: boolean }
  | { type: 'end' };

/** The full state after one step: deterministic, serialisable, renderer-agnostic. */
export interface Frame {
  index: number;
  /** 1-based source line that just ran (0 for start/end). */
  line: number;
  vars: Record<string, Value>;
  output: string[];
  event: StepEvent;
  /** Variable that changed in this step, for highlighting. */
  changed: string | null;
}

export const MAX_STEPS = 500;

export class StepLimitError extends PseudoError {
  constructor(line: number) {
    super(line, `stopped after ${MAX_STEPS} steps: does this loop ever end?`);
    this.name = 'StepLimitError';
  }
}

export function formatValue(value: Value): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

/** Source text of an expression; with `vars`, names are replaced by their current values. */
export function exprText(expr: Expr, vars?: Record<string, Value>): string {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'string' ? `"${expr.value}"` : formatValue(expr.value);
    case 'name': {
      const value = vars?.[expr.name];
      if (value === undefined) return expr.name;
      return typeof value === 'string' ? `"${value}"` : formatValue(value);
    }
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

function evaluate(expr: Expr, vars: Record<string, Value>, line: number): Value {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'name': {
      const value = vars[expr.name];
      if (value === undefined) throw new PseudoError(line, `"${expr.name}" has no value yet`);
      return value;
    }
    case 'unary': {
      const v = evaluate(expr.operand, vars, line);
      if (expr.op === 'not') return !truthy(v, line);
      return -number(v, line);
    }
    case 'binary': {
      if (expr.op === 'and')
        return (
          truthy(evaluate(expr.left, vars, line), line) &&
          truthy(evaluate(expr.right, vars, line), line)
        );
      if (expr.op === 'or')
        return (
          truthy(evaluate(expr.left, vars, line), line) ||
          truthy(evaluate(expr.right, vars, line), line)
        );
      const l = evaluate(expr.left, vars, line);
      const r = evaluate(expr.right, vars, line);
      switch (expr.op) {
        case '+':
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
          return l === r;
        case '!=':
          return l !== r;
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
}

function number(v: Value, line: number): number {
  if (typeof v !== 'number')
    throw new PseudoError(line, `expected a number but got ${JSON.stringify(v)}`);
  return v;
}

function truthy(v: Value, line: number): boolean {
  if (typeof v !== 'boolean')
    throw new PseudoError(line, `expected true or false but got ${JSON.stringify(v)}`);
  return v;
}

/** Runs a program and records a frame after every step. */
export function run(source: string): Frame[] {
  const program = parseProgram(source);
  const vars: Record<string, Value> = {};
  const output: string[] = [];
  const frames: Frame[] = [];

  const record = (line: number, event: StepEvent, changed: string | null = null) => {
    if (frames.length >= MAX_STEPS) throw new StepLimitError(line);
    frames.push({
      index: frames.length,
      line,
      vars: { ...vars },
      output: [...output],
      event,
      changed,
    });
  };

  const exec = (stmts: Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'assign': {
          const previous = vars[stmt.name];
          const work = exprText(stmt.expr, vars);
          vars[stmt.name] = evaluate(stmt.expr, vars, stmt.line);
          record(
            stmt.line,
            { type: 'assign', name: stmt.name, value: vars[stmt.name]!, previous, work },
            stmt.name,
          );
          break;
        }
        case 'say': {
          const value = evaluate(stmt.expr, vars, stmt.line);
          output.push(formatValue(value));
          record(stmt.line, { type: 'say', value });
          break;
        }
        case 'for': {
          const from = number(evaluate(stmt.from, vars, stmt.line), stmt.line);
          const to = number(evaluate(stmt.to, vars, stmt.line), stmt.line);
          let i = from;
          while (i <= to) {
            vars[stmt.name] = i;
            record(stmt.line, { type: 'loop-enter', name: stmt.name, value: i, to }, stmt.name);
            exec(stmt.body);
            i++;
          }
          record(stmt.line, { type: 'loop-exit', name: stmt.name, value: i, to });
          break;
        }
        case 'while': {
          for (;;) {
            const result = truthy(evaluate(stmt.cond, vars, stmt.line), stmt.line);
            record(stmt.line, {
              type: 'while-check',
              condition: exprText(stmt.cond, vars),
              result,
            });
            if (!result) break;
            exec(stmt.body);
          }
          break;
        }
        case 'if': {
          const result = truthy(evaluate(stmt.cond, vars, stmt.line), stmt.line);
          record(stmt.line, { type: 'if-check', condition: exprText(stmt.cond, vars), result });
          if (result) exec(stmt.then);
          else if (stmt.otherwise) exec(stmt.otherwise);
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

/**
 * Trace-table rows: the value of each column every time `line` finishes running.
 * Missing values are null.
 */
export function traceRows(
  frames: Frame[],
  line: number,
  columns: readonly string[],
): (string | null)[][] {
  return frames
    .filter((frame) => frame.line === line && frame.event.type !== 'loop-exit')
    .map((frame) =>
      columns.map((column) => {
        const value = frame.vars[column];
        return value === undefined ? null : formatValue(value);
      }),
    );
}
