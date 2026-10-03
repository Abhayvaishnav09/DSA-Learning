/**
 * The Python side of the tracer (docs/07-code-execution.md §1), run inside Pyodide.
 *
 * `trace(code, stdin)` parses the learner's program, runs it under `sys.settrace` and returns
 * JSON: one event per line/call/return in the learner's own code, each with a snapshot of
 * every variable, plus what the static pass learned (loops over lists, conditions, index
 * variables) so the player can draw the find_paper look. Nothing here touches the page: the
 * worker only ever sees the returned string.
 */
import { DETECT_PY } from './detect';
import { DERIVE_PY } from './derive';
import { MEASURE_PY } from './measure';

export const TRACER_PY =
  String.raw`
import ast, builtins, json, sys

MAX_STEPS = 1000
MAX_ITEMS = 40
MAX_DEPTH = 3
MAX_TEXT = 120
FILE = '<main>'
BLOCKED = {'js', 'pyodide', 'pyodide_js', '_pyodide', 'micropip', 'pyodide_http'}


class StepLimit(BaseException):
    pass


def _names(node):
    return [n.id for n in ast.walk(node) if isinstance(n, ast.Name)]


def _span(body):
    return [body[0].lineno, max(getattr(s, 'end_lineno', s.lineno) or s.lineno for s in body)]


def _len_of(node):
    """The list name in len(name), anywhere inside node."""
    for n in ast.walk(node):
        if (isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'len'
                and len(n.args) == 1 and isinstance(n.args[0], ast.Name)):
            return n.args[0].id
    return None


def analyse(tree):
    loops, conds, stmts, index_vars = {}, {}, {}, {}
    compares, assigns = [], []

    def add_index(fn, lst, names):
        cur = index_vars.setdefault(fn, {}).setdefault(lst, [])
        added = False
        for n in names:
            if n != lst and n not in cur:
                cur.append(n)
                added = True
        return added

    def visit(node, fn):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                stmts.setdefault(child.lineno, {'kind': 'def', 'name': child.name})
                visit(child, child.name)
                continue
            if isinstance(child, ast.ClassDef):
                stmts.setdefault(child.lineno, {'kind': 'class', 'name': child.name})
            elif isinstance(child, ast.stmt):
                stmts.setdefault(child.lineno, {'kind': type(child).__name__})
            if isinstance(child, ast.For):
                it = child.iter
                info = {'vars': _names(child.target), 'list': None, 'mode': None,
                        'body': _span(child.body), 'fn': fn}
                if isinstance(it, ast.Name):
                    info['list'], info['mode'] = it.id, 'items'
                elif isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.args:
                    first = it.args[0]
                    if it.func.id == 'enumerate' and isinstance(first, ast.Name):
                        info['list'], info['mode'] = first.id, 'items'
                    elif (it.func.id == 'range' and len(it.args) == 1 and _len_of(first)
                          and isinstance(first, ast.Call)):
                        info['list'], info['mode'] = _len_of(first), 'range'
                        add_index(fn, info['list'], info['vars'])
                loops[child.lineno] = info
            if isinstance(child, (ast.If, ast.While)):
                conds[child.lineno] = {'names': _names(child.test), 'test': child.test,
                                       'body': _span(child.body),
                                       'kind': 'while' if isinstance(child, ast.While) else 'if'}
            if isinstance(child, ast.Subscript) and isinstance(child.value, ast.Name):
                add_index(fn, child.value.id, _names(child.slice))
            if isinstance(child, ast.Compare):
                compares.append((fn, [child.left] + list(child.comparators)))
            if (isinstance(child, ast.Assign) and len(child.targets) == 1
                    and isinstance(child.targets[0], ast.Name)):
                assigns.append((fn, child.targets[0].id, child.value))
            visit(child, fn)

    visit(tree, '')

    # hi = len(arr) - 1, lo = mid + 1, while lo <= hi: these name positions in arr too.
    for _ in range(3):
        for fn, target, value in assigns:
            lst = _len_of(value)
            if lst:
                add_index(fn, lst, [target])
                continue
            used = set(_names(value))
            for lst, known in index_vars.get(fn, {}).items():
                if used and used <= set(known):
                    add_index(fn, lst, [target])
        for fn, operands in compares:
            simple = [o.id for o in operands if isinstance(o, ast.Name)]
            for lst, known in list(index_vars.get(fn, {}).items()):
                linked = any((isinstance(o, ast.Name) and o.id in known) or
                             (_len_of(o) == lst) for o in operands)
                if linked:
                    add_index(fn, lst, simple)
    return loops, conds, stmts, index_vars


def _cut(text):
    return text if len(text) <= MAX_TEXT else text[:MAX_TEXT] + '…'


def encode(v, depth=0, seen=frozenset()):
    t = type(v)
    if v is None:
        return {'kind': 'atom', 'text': 'None', 'type': 'none'}
    if t is bool:
        return {'kind': 'atom', 'text': str(v), 'type': 'boolean'}
    if t is int or t is float:
        return {'kind': 'atom', 'text': _cut(repr(v)), 'type': 'number'}
    if t is str:
        return {'kind': 'atom', 'text': _cut(v), 'type': 'string'}
    if t in (list, tuple, set, frozenset, dict):
        if depth >= MAX_DEPTH or id(v) in seen:
            return {'kind': 'atom', 'text': '…', 'type': 'other'}
        seen = seen | {id(v)}
        more = max(0, len(v) - MAX_ITEMS)
        if t is dict:
            entries = [[encode(k, depth + 1, seen), encode(x, depth + 1, seen)]
                       for k, x in list(v.items())[:MAX_ITEMS]]
            return {'kind': 'dict', 'entries': entries, 'ref': str(id(v)), 'more': more}
        kind = 'list' if t is list else 'tuple' if t is tuple else 'set'
        items = [encode(x, depth + 1, seen) for x in list(v)[:MAX_ITEMS]]
        return {'kind': 'seq', 'type': kind, 'items': items, 'ref': str(id(v)), 'more': more}
    if type(t).__name__ == 'type' and getattr(t, '__module__', '') == '__main__' and hasattr(v, '__dict__'):
        if depth >= MAX_DEPTH or id(v) in seen:
            return {'kind': 'atom', 'text': t.__name__ + '(…)', 'type': 'other'}
        seen = seen | {id(v)}
        fields = list(vars(v).items())[:MAX_ITEMS]
        return {'kind': 'dict', 'ref': str(id(v)),
                'entries': [[{'kind': 'atom', 'text': k, 'type': 'other'}, encode(x, depth + 1, seen)]
                            for k, x in fields], 'more': 0, 'label': t.__name__}
    try:
        text = repr(v)
    except Exception:
        text = '<' + t.__name__ + '>'
    return {'kind': 'atom', 'text': _cut(text), 'type': 'other'}


def _shown(name, v):
    if name.startswith('__'):
        return False
    t = type(v).__name__
    return t not in ('module', 'function', 'builtin_function_or_method', 'type') and not (
        t == 'type' or callable(v) and t in ('method', 'classmethod', 'staticmethod'))


def boxes(scope):
    return [{'name': k, 'value': encode(v)} for k, v in list(scope.items()) if _shown(k, v)]


def _short(v):
    if v is None or type(v) in (bool, int, float) or (type(v) is str and len(v) <= 30):
        return True
    return False


class _Valued(ast.NodeTransformer):
    def __init__(self, frame):
        self.frame = frame

    def visit_Name(self, node):
        scope = self.frame.f_locals
        if node.id in scope:
            v = scope[node.id]
        elif node.id in self.frame.f_globals:
            v = self.frame.f_globals[node.id]
        else:
            return node
        return ast.copy_location(ast.Constant(v), node) if _short(v) else node


def valued(test, frame):
    """The condition with current values put in: p == name -> 'Alice' == 'Emma'."""
    try:
        return ast.unparse(_Valued(frame).visit(ast.parse(ast.unparse(test), mode='eval').body))
    except Exception:
        return ast.unparse(test)


def trace(code, stdin_text):
    try:
        tree = ast.parse(code, FILE)
    except SyntaxError as e:
        return json.dumps({'events': [], 'analysis': None, 'output': [],
                           'error': {'type': 'SyntaxError', 'message': e.msg or 'invalid syntax',
                                     'line': e.lineno or 0}})
    loops, conds, stmts, index_vars = analyse(tree)
    events, out = [], []
    pending = {}     # frame id -> index of a for/if/while event waiting for the next line
    last_line = {}   # frame id -> last line run in that frame
    counts = {}      # (frame id, loop line) -> rounds so far
    stdin = (stdin_text or '').split('\n') if stdin_text else []

    class Out:
        def write(self, s):
            out.append(s)
            return len(s)

        def flush(self):
            pass

    def lines():
        text = ''.join(out)
        if not text:
            return []
        parts = text.split('\n')
        return parts[:-1] if text.endswith('\n') else parts

    def user_input(prompt=''):
        if prompt:
            out.append(str(prompt))
        if not stdin:
            raise EOFError('input() needs a value: type it in the Input box')
        value = stdin.pop(0)
        out.append(value + '\n')
        return value

    def safe_import(name, *args, **kwargs):
        if name.split('.')[0] in BLOCKED:
            raise ImportError('module ' + name + ' is not available here')
        return builtins.__import__(name, *args, **kwargs)

    def snapshot(frame):
        chain, f = [], frame
        while f is not None:
            if f.f_code.co_filename == FILE and f.f_code.co_name != '<module>':
                chain.append(f)
            f = f.f_back
        chain.reverse()
        return {'globals': boxes(frame.f_globals),
                'stack': [{'name': c.f_code.co_name, 'boxes': boxes(c.f_locals)} for c in chain],
                'output': lines()}

    def resolve(fid, next_line):
        idx = pending.pop(fid, None)
        if idx is None:
            return
        ev = events[idx]
        body = ev.get('body')
        inside = next_line is not None and body is not None and body[0] <= next_line <= body[1]
        if 'check' in ev:
            ev['check']['result'] = inside
        if 'loop' in ev:
            ev['loop']['done'] = not inside

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != FILE:
            return None
        if len(events) >= MAX_STEPS:
            raise StepLimit()
        fid = id(frame)
        name = frame.f_code.co_name
        if event == 'line':
            line = frame.f_lineno
            resolve(fid, line)
            ev = {'kind': 'line', 'line': line, 'func': name}
            ev.update(snapshot(frame))
            info = stmts.get(line)
            if info:
                ev['stmt'] = info
            if line in conds:
                c = conds[line]
                ev['check'] = {'text': ast.unparse(c['test']), 'valued': valued(c['test'], frame),
                               'names': c['names'], 'kind': c['kind'], 'result': None}
                ev['body'] = c['body']
                pending[fid] = len(events)
            elif line in loops:
                lp = loops[line]
                prev = last_line.get(fid)
                key = (fid, line)
                if prev is not None and (lp['body'][0] <= prev <= lp['body'][1] or prev == line):
                    counts[key] = counts.get(key, 0) + 1
                else:
                    counts[key] = 0
                loop = {'vars': lp['vars'], 'position': counts[key], 'done': False}
                if lp['list']:
                    scope = frame.f_locals if lp['list'] in frame.f_locals else frame.f_globals
                    obj = scope.get(lp['list'])
                    try:
                        loop['total'] = len(obj)
                        loop['list'] = lp['list']
                        loop['mode'] = lp['mode']
                        loop['ref'] = str(id(obj))
                        if lp['mode'] == 'items' and counts[key] < len(obj):
                            loop['item'] = encode(list(obj)[counts[key]])
                    except Exception:
                        pass
                ev['loop'] = loop
                ev['body'] = lp['body']
                pending[fid] = len(events)
            last_line[fid] = line
            events.append(ev)
        elif event == 'call':
            ev = {'kind': 'call', 'line': frame.f_lineno, 'func': name}
            ev.update(snapshot(frame))
            events.append(ev)
        elif event == 'return':
            resolve(fid, None)
            caller = frame.f_back
            ev = {'kind': 'return', 'line': frame.f_lineno, 'func': name, 'value': encode(arg),
                  'callerLine': caller.f_lineno if caller is not None and
                  caller.f_code.co_filename == FILE else 0}
            ev.update(snapshot(frame))
            events.append(ev)
            last_line.pop(fid, None)
        elif event == 'exception':
            pending.pop(fid, None)
        return tracer

    safe_builtins = dict(vars(builtins))
    safe_builtins['__import__'] = safe_import
    safe_builtins['input'] = user_input
    namespace = {'__name__': '__main__', '__builtins__': safe_builtins}
    error = None
    real_stdout = sys.stdout
    sys.stdout = Out()
    compiled = compile(tree, FILE, 'exec')
    sys.settrace(tracer)
    try:
        exec(compiled, namespace)
    except StepLimit:
        error = {'type': 'StepLimit', 'message': str(MAX_STEPS), 'line': events[-1]['line'] if events else 0}
    except BaseException as e:
        tb, line = e.__traceback__, 0
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == FILE:
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {'type': type(e).__name__, 'message': str(e), 'line': line}
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout
    for fid in list(pending):
        resolve(fid, None)
    final = {'globals': boxes(namespace), 'stack': [], 'output': lines()}
    return json.dumps({'events': events, 'final': final, 'error': error,
                       'indexVars': index_vars, 'algorithms': identify(tree),
                       'derived': derive(tree, code)})
` +
  DETECT_PY +
  MEASURE_PY +
  DERIVE_PY;
