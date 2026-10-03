import { caption, LOCALES, type Locale } from '../engine/captions';
import { parseProgram, type Expr, type Stmt, type Value } from '../engine/parse';
import { formatValue, run, type Frame } from '../engine/run';
import { markCells, type IndexVars, type StepHints } from './marks';
import type { ViewBox, ViewFrame, ViewValue } from './model';

export function toView(value: Value): ViewValue {
  if (Array.isArray(value)) return { kind: 'seq', type: 'list', items: value.map(toView) };
  return {
    kind: 'atom',
    text: formatValue(value),
    type: typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'boolean',
  };
}

const boxes = (vars: Record<string, Value>): ViewBox[] =>
  Object.entries(vars).map(([name, value]) => ({ name, value: toView(value) }));

function names(expr: Expr, into = new Set<string>()): Set<string> {
  switch (expr.kind) {
    case 'literal':
      break;
    case 'name':
      into.add(expr.name);
      break;
    case 'list':
      expr.items.forEach((e) => names(e, into));
      break;
    case 'index':
      names(expr.target, into);
      names(expr.index, into);
      break;
    case 'call':
      expr.args.forEach((e) => names(e, into));
      break;
    case 'unary':
      names(expr.operand, into);
      break;
    case 'binary':
      names(expr.left, into);
      names(expr.right, into);
      break;
  }
  return into;
}

interface Analysis {
  /** for-each line -> the list's name, when it loops over a named list. */
  eachList: Map<number, string>;
  /** if / while line -> names its condition reads. */
  conditions: Map<number, string[]>;
  indexVars: IndexVars;
}

function analyse(program: Stmt[]): Analysis {
  const eachList = new Map<number, string>();
  const conditions = new Map<number, string[]>();
  const indexVars: IndexVars = {};
  const addIndex = (fn: string, list: string, vars: Iterable<string>) => {
    const scope = (indexVars[fn] ??= {});
    scope[list] = [...new Set([...(scope[list] ?? []), ...vars])];
  };
  const visitExpr = (expr: Expr, fn: string) => {
    if (expr.kind === 'index' && expr.target.kind === 'name')
      addIndex(fn, expr.target.name, names(expr.index));
    if (expr.kind === 'index') {
      visitExpr(expr.target, fn);
      visitExpr(expr.index, fn);
    } else if (expr.kind === 'list') expr.items.forEach((e) => visitExpr(e, fn));
    else if (expr.kind === 'call') expr.args.forEach((e) => visitExpr(e, fn));
    else if (expr.kind === 'unary') visitExpr(expr.operand, fn);
    else if (expr.kind === 'binary') {
      visitExpr(expr.left, fn);
      visitExpr(expr.right, fn);
    }
  };
  const visit = (stmts: Stmt[], fn: string) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'assign':
          if (stmt.index) {
            addIndex(fn, stmt.name, names(stmt.index));
            visitExpr(stmt.index, fn);
          }
          visitExpr(stmt.expr, fn);
          break;
        case 'say':
          visitExpr(stmt.expr, fn);
          break;
        case 'for':
          visitExpr(stmt.from, fn);
          visitExpr(stmt.to, fn);
          visit(stmt.body, fn);
          break;
        case 'foreach':
          if (stmt.list.kind === 'name') eachList.set(stmt.line, stmt.list.name);
          visitExpr(stmt.list, fn);
          visit(stmt.body, fn);
          break;
        case 'while':
          conditions.set(stmt.line, [...names(stmt.cond)]);
          visitExpr(stmt.cond, fn);
          visit(stmt.body, fn);
          break;
        case 'if':
          conditions.set(stmt.line, [...names(stmt.cond)]);
          visitExpr(stmt.cond, fn);
          visit(stmt.then, fn);
          if (stmt.otherwise) visit(stmt.otherwise, fn);
          break;
        case 'define':
          visit(stmt.body, stmt.name);
          break;
        case 'return':
          if (stmt.expr) visitExpr(stmt.expr, fn);
          break;
        case 'call':
          visitExpr(stmt.expr, fn);
          break;
      }
    }
  };
  visit(program, '');
  return { eachList, conditions, indexVars };
}

/** The pseudocode engine's frames in the player's shape, with list-cell marks. */
export function viewFromFrames(source: string, frames: Frame[]): ViewFrame[] {
  const { eachList, conditions, indexVars } = analyse(parseProgram(source));
  let checks = 0;
  const hints: StepHints[] = [];
  const unmarked = frames.map((frame) => {
    const e = frame.event;
    const hint: StepHints = {};
    if (e.type === 'if-check' || e.type === 'while-check') {
      checks++;
      hint.check = { names: conditions.get(frame.line) ?? [], result: e.result };
    }
    const list = eachList.get(frame.line);
    if (list && e.type === 'each-enter')
      hint.iter = { list: `name:${list}`, vars: [e.name], position: e.position, total: e.total };
    if (list && e.type === 'each-exit')
      hint.iter = { list: `name:${list}`, vars: [e.name], position: e.total, total: e.total };
    hints.push(hint);
    return {
      index: frame.index,
      line: frame.line,
      globals: boxes(frame.vars),
      stack: frame.stack.map((s) => ({ name: s.name, boxes: boxes(s.vars) })),
      output: frame.output,
      printed: e.type === 'say',
      caption: Object.fromEntries(LOCALES.map((l) => [l, caption(frame, l)])) as Record<
        Locale,
        string
      >,
      changed: frame.changed ? { depth: frame.stack.length - 1, name: frame.changed } : null,
      changedIndex: frame.changedIndex,
      checks,
    };
  });
  return markCells(unmarked, hints, indexVars);
}

export function viewPseudocode(source: string): ViewFrame[] {
  return viewFromFrames(source, run(source));
}
