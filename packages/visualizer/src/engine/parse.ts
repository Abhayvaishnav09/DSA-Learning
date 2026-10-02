/**
 * Parser for the beginner pseudocode used in Stages 0 to 3 (ADR-0009).
 *
 *   count = 0                      nums = [3, 8, 1]
 *   for i from 1 to 3:             for each n in nums:
 *       count = count + 1              say n
 *   if count > 2:                  nums[0] = 5
 *       say "big"                  add(nums, 9)
 *   else if count > 1:             say len(nums)
 *       say "medium"
 *   else:                          define double(x):
 *       say "small"                    return x * 2
 *   while count > 0:               say double(4)
 *       count = count - 1
 *
 * Blocks are indented under a line ending in ":". `#` starts a comment. Lists are values:
 * `b = a` copies the list (beginners meet references later, with real languages).
 */

export type Value = number | string | boolean | Value[];

export type Expr =
  | { kind: 'literal'; value: Value }
  | { kind: 'name'; name: string }
  | { kind: 'list'; items: Expr[] }
  | { kind: 'index'; target: Expr; index: Expr }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'unary'; op: '-' | 'not'; operand: Expr }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr };

export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or';

export type Stmt =
  | { kind: 'assign'; line: number; name: string; index: Expr | null; expr: Expr }
  | { kind: 'say'; line: number; expr: Expr }
  | { kind: 'for'; line: number; name: string; from: Expr; to: Expr; body: Stmt[] }
  | { kind: 'foreach'; line: number; name: string; list: Expr; body: Stmt[] }
  | { kind: 'while'; line: number; cond: Expr; body: Stmt[] }
  | {
      kind: 'if';
      line: number;
      cond: Expr;
      then: Stmt[];
      otherwise: Stmt[] | null;
      elseLine: number | null;
    }
  | { kind: 'define'; line: number; name: string; params: string[]; body: Stmt[] }
  | { kind: 'return'; line: number; expr: Expr | null }
  | { kind: 'call'; line: number; expr: Extract<Expr, { kind: 'call' }> };

export class PseudoError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`line ${line}: ${message}`);
    this.name = 'PseudoError';
  }
}

interface SourceLine {
  line: number;
  indent: number;
  text: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const KEYWORDS = new Set([
  'for',
  'each',
  'in',
  'from',
  'to',
  'while',
  'if',
  'else',
  'say',
  'and',
  'or',
  'not',
  'true',
  'false',
  'define',
  'return',
]);
/** Functions every program has. */
export const BUILTINS = new Set(['len', 'add']);

function stripComment(text: string): string {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inString = !inString;
    if (ch === '#' && !inString) return text.slice(0, i);
  }
  return text;
}

function sourceLines(source: string): SourceLine[] {
  return source.split('\n').flatMap((raw, index) => {
    const withoutComment = stripComment(raw).replace(/\s+$/, '');
    if (withoutComment.trim() === '') return [];
    if (/^\s*\t/.test(withoutComment)) throw new PseudoError(index + 1, 'use spaces, not tabs');
    const indent = withoutComment.length - withoutComment.trimStart().length;
    return [{ line: index + 1, indent, text: withoutComment.trim() }];
  });
}

// ---------- expressions ----------

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'word'; value: string }
  | { type: 'op'; value: string };

function tokenize(text: string, line: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ' ') {
      i++;
    } else if (/[0-9]/.test(ch)) {
      const match = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(i))!;
      tokens.push({ type: 'num', value: Number(match[0]) });
      i += match[0].length;
    } else if (ch === '"') {
      const end = text.indexOf('"', i + 1);
      if (end === -1) throw new PseudoError(line, 'text is missing its closing "');
      tokens.push({ type: 'str', value: text.slice(i + 1, end) });
      i = end + 1;
    } else if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))!;
      tokens.push({ type: 'word', value: match[0] });
      i += match[0].length;
    } else {
      const two = text.slice(i, i + 2);
      if (['==', '!=', '<=', '>='].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
      } else if ('+-*/%<>()[],'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
      } else if (ch === '=') {
        throw new PseudoError(line, 'use == to compare; a single = puts a value in a box');
      } else {
        throw new PseudoError(line, `unexpected "${ch}"`);
      }
    }
  }
  return tokens;
}

export function parseExpr(text: string, line: number): Expr {
  const tokens = tokenize(text, line);
  let pos = 0;

  const peek = () => tokens[pos];
  const isOp = (...ops: string[]) => {
    const t = peek();
    return !!t && (t.type === 'op' || t.type === 'word') && ops.includes(t.value as string);
  };
  const expect = (op: string, message: string) => {
    if (!isOp(op)) throw new PseudoError(line, message);
    pos++;
  };

  const binaryLevel = (ops: BinaryOp[], next: () => Expr) => (): Expr => {
    let left = next();
    while (isOp(...ops)) {
      const op = tokens[pos++]!.value as BinaryOp;
      left = { kind: 'binary', op, left, right: next() };
    }
    return left;
  };

  /** Comma-separated expressions up to `close`. */
  const list = (close: string): Expr[] => {
    const items: Expr[] = [];
    if (isOp(close)) {
      pos++;
      return items;
    }
    for (;;) {
      items.push(or());
      if (isOp(',')) {
        pos++;
        continue;
      }
      expect(close, `missing ${close}`);
      return items;
    }
  };

  const atom = (): Expr => {
    const t = tokens[pos++];
    if (!t) throw new PseudoError(line, 'expression ends too early');
    if (t.type === 'num' || t.type === 'str') return { kind: 'literal', value: t.value };
    if (t.type === 'word') {
      if (t.value === 'true' || t.value === 'false')
        return { kind: 'literal', value: t.value === 'true' };
      if (KEYWORDS.has(t.value)) throw new PseudoError(line, `"${t.value}" can't be used here`);
      if (isOp('(')) {
        pos++;
        return { kind: 'call', name: t.value, args: list(')') };
      }
      return { kind: 'name', name: t.value };
    }
    if (t.value === '(') {
      const inner = or();
      expect(')', 'missing )');
      return inner;
    }
    if (t.value === '[') return { kind: 'list', items: list(']') };
    throw new PseudoError(line, `unexpected "${t.value}"`);
  };
  const postfix = (): Expr => {
    let expr = atom();
    while (isOp('[')) {
      pos++;
      const index = or();
      expect(']', 'missing ]');
      expr = { kind: 'index', target: expr, index };
    }
    return expr;
  };
  const unary = (): Expr => {
    if (isOp('-')) {
      pos++;
      return { kind: 'unary', op: '-', operand: unary() };
    }
    return postfix();
  };
  const multiplicative = binaryLevel(['*', '/', '%'], unary);
  const additive = binaryLevel(['+', '-'], multiplicative);
  const comparison = binaryLevel(['==', '!=', '<', '<=', '>', '>='], additive);
  const not = (): Expr => {
    if (isOp('not')) {
      pos++;
      return { kind: 'unary', op: 'not', operand: not() };
    }
    return comparison();
  };
  const and = binaryLevel(['and'], not);
  const or: () => Expr = binaryLevel(['or'], and);

  const expr = or();
  if (pos < tokens.length)
    throw new PseudoError(line, `unexpected "${String(tokens[pos]!.value)}"`);
  return expr;
}

// ---------- statements ----------

export function parseProgram(source: string): Stmt[] {
  const lines = sourceLines(source);
  let pos = 0;
  let functionDepth = 0;

  const block = (indent: number): Stmt[] => {
    const stmts: Stmt[] = [];
    while (pos < lines.length && lines[pos]!.indent >= indent) {
      const current = lines[pos]!;
      if (current.indent > indent)
        throw new PseudoError(current.line, 'this line is indented too far');
      stmts.push(statement(current));
    }
    return stmts;
  };

  const body = (header: SourceLine): Stmt[] => {
    const next = lines[pos];
    if (!next || next.indent <= header.indent) {
      throw new PseudoError(header.line, 'the lines inside this block must be indented');
    }
    return block(next.indent);
  };

  const checkName = (name: string, line: number) => {
    if (!NAME.test(name) || KEYWORDS.has(name))
      throw new PseudoError(line, `"${name}" is not a valid name`);
    if (BUILTINS.has(name)) throw new PseudoError(line, `"${name}" is a built-in command`);
  };

  /** if / else if / else chain; `else if` becomes a nested if inside `otherwise`. */
  const ifChain = (header: SourceLine, condText: string): Stmt => {
    const cond = parseExpr(condText, header.line);
    const then = body(header);
    const next = lines[pos];
    if (next && next.indent === header.indent) {
      if (next.text === 'else:') {
        pos++;
        return {
          kind: 'if',
          line: header.line,
          cond,
          then,
          otherwise: body(next),
          elseLine: next.line,
        };
      }
      const elseIf = /^else\s+if\s+(.+):$/.exec(next.text);
      if (elseIf) {
        pos++;
        return {
          kind: 'if',
          line: header.line,
          cond,
          then,
          otherwise: [ifChain(next, elseIf[1]!)],
          elseLine: next.line,
        };
      }
    }
    return { kind: 'if', line: header.line, cond, then, otherwise: null, elseLine: null };
  };

  const statement = (current: SourceLine): Stmt => {
    pos++;
    const { line, text } = current;
    let m: RegExpExecArray | null;

    if ((m = /^for\s+each\s+([A-Za-z_]\w*)\s+in\s+(.+):$/.exec(text))) {
      checkName(m[1]!, line);
      return {
        kind: 'foreach',
        line,
        name: m[1]!,
        list: parseExpr(m[2]!, line),
        body: body(current),
      };
    }
    if ((m = /^for\s+([A-Za-z_]\w*)\s+from\s+(.+)\s+to\s+(.+):$/.exec(text))) {
      checkName(m[1]!, line);
      return {
        kind: 'for',
        line,
        name: m[1]!,
        from: parseExpr(m[2]!, line),
        to: parseExpr(m[3]!, line),
        body: body(current),
      };
    }
    if ((m = /^while\s+(.+):$/.exec(text))) {
      return { kind: 'while', line, cond: parseExpr(m[1]!, line), body: body(current) };
    }
    if ((m = /^if\s+(.+):$/.exec(text))) return ifChain(current, m[1]!);
    if (text === 'else:' || /^else\s+if\b/.test(text))
      throw new PseudoError(line, '"else" must follow an "if" block');
    if ((m = /^define\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/.exec(text))) {
      if (functionDepth > 0)
        throw new PseudoError(line, 'define functions at the top level, not inside another block');
      checkName(m[1]!, line);
      const params = m[2]!.trim() === '' ? [] : m[2]!.split(',').map((p) => p.trim());
      params.forEach((p) => checkName(p, line));
      if (new Set(params).size !== params.length)
        throw new PseudoError(line, 'two inputs have the same name');
      functionDepth++;
      const fnBody = body(current);
      functionDepth--;
      return { kind: 'define', line, name: m[1]!, params, body: fnBody };
    }
    if ((m = /^return(?:\s+(.+))?$/.exec(text))) {
      if (functionDepth === 0) throw new PseudoError(line, '"return" only works inside a function');
      return { kind: 'return', line, expr: m[1] ? parseExpr(m[1], line) : null };
    }
    if ((m = /^say\s+(.+)$/.exec(text))) {
      return { kind: 'say', line, expr: parseExpr(m[1]!, line) };
    }
    if ((m = /^([A-Za-z_]\w*)(?:\[(.+)\])?\s*=(?!=)\s*(.+)$/.exec(text))) {
      checkName(m[1]!, line);
      return {
        kind: 'assign',
        line,
        name: m[1]!,
        index: m[2] !== undefined ? parseExpr(m[2], line) : null,
        expr: parseExpr(m[3]!, line),
      };
    }
    if (/^[A-Za-z_]\w*\s*\(.*\)$/.test(text)) {
      const expr = parseExpr(text, line);
      if (expr.kind === 'call') return { kind: 'call', line, expr };
    }
    throw new PseudoError(line, `I don't understand "${text}"`);
  };

  const program = block(0);
  if (pos < lines.length) throw new PseudoError(lines[pos]!.line, 'this line is indented too far');
  return program;
}
