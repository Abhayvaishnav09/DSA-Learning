/**
 * Works out Big-O from the shape of the code, the way a teacher does on the board: how many
 * times each loop runs (n, log n when something halves, √n for i * i <= n), multiplied through
 * nesting, plus the hidden work of built-ins (sorted, `in` on a list, slices) and recursion
 * solved by its recurrence (one call on n - 1: n; two on n - 1: 2ⁿ; two on halves: n log n).
 *
 * Every conclusion is kept as a step, so the learner sees the reasoning, not just the answer.
 * When a loop's count depends on the data in a way the shape does not show, the result is
 * marked unsure instead of guessed.
 */
export const DERIVE_PY = String.raw`

# A cost is (exponential, power of n, power of log n, power of log log n); tuples compare in
# that order, so max() picks the bigger growth.
C1 = (0, 0, 0, 0)
CN = (0, 1, 0, 0)
CLOG = (0, 0, 1, 0)
CSQRT = (0, 0.5, 0, 0)
CNLOGN = (0, 1, 1, 0)
CEXP = (1, 0, 0, 0)

SUPER = {2: '²', 3: '³', 4: '⁴'}


def c_mul(a, b):
    if a[0] or b[0]:
        return CEXP
    return (0, a[1] + b[1], a[2] + b[2], a[3] + b[3])


def c_label(c, graph=False):
    if c[0]:
        return 'O(2ⁿ)'
    k, j, ll = c[1], c[2], c[3]
    if k == 0 and j == 0 and ll == 0:
        return 'O(1)'
    if graph and c == CN:
        return 'O(V + E)'
    parts = []
    if k == 0.5:
        parts.append('√n')
    elif k == 1.5:
        parts.append('n√n')
    elif k == 1:
        parts.append('n')
    elif k in SUPER:
        parts.append('n' + SUPER[k])
    elif k:
        parts.append('n^' + str(k))
    if j == 1:
        parts.append('log n')
    elif j:
        parts.append('log' + SUPER.get(j, '^' + str(j)) + ' n')
    if ll:
        parts.append('log log n')
    return 'O(' + ' '.join(parts) + ')'


LINEAR_METHODS = {'index', 'count', 'remove', 'insert', 'copy', 'extend', 'reverse', 'join',
                  'split', 'replace', 'find', 'lower', 'upper', 'strip', 'startswith', 'endswith'}
# One argument only: max(a, b) is a single comparison, max(nums) walks the list.
LINEAR_BUILTINS = {'sum', 'min', 'max', 'list', 'set', 'tuple', 'dict', 'any', 'all',
                   'frozenset', 'Counter', 'deque'}
# Names that hold a set or dict in most beginner code, even when passed in as a parameter.
SET_NAMES = {'visited', 'seen', 'memo', 'cache', 'lookup'}
SET_MAKERS = {'set', 'dict', 'frozenset', 'Counter', 'defaultdict', 'OrderedDict'}


def _halving(node, names):
    """x //= 2, x = x // 2, x >>= 1, x *= 2 on one of names."""
    if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name) and node.target.id in names:
        if isinstance(node.op, (ast.FloorDiv, ast.Div, ast.RShift, ast.Mult, ast.LShift)) \
                and isinstance(node.value, ast.Constant) and node.value.value in (1, 2):
            return True
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) \
            and node.targets[0].id in names:
        v = node.value
        if isinstance(v, ast.BinOp) and isinstance(v.op, (ast.FloorDiv, ast.Div, ast.RShift, ast.Mult, ast.LShift)) \
                and isinstance(v.right, ast.Constant) and v.right.value in (1, 2) and node.targets[0].id in _names(v.left):
            return True
    return False


def _stepping(node, names):
    """i += 1, i -= 1, i = i + 1 on one of names, or q.pop() / q.popleft() draining q."""
    if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name) and node.target.id in names \
            and isinstance(node.op, (ast.Add, ast.Sub)):
        return True
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) \
            and node.targets[0].id in names and isinstance(node.value, ast.BinOp) \
            and isinstance(node.value.op, (ast.Add, ast.Sub)) and node.targets[0].id in _names(node.value):
        return True
    return False


def _drains(node, names):
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            and node.func.attr in ('pop', 'popleft') and isinstance(node.func.value, ast.Name)
            and node.func.value.id in names)


def _has_sqrt(node):
    for n in ast.walk(node):
        if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Pow) and isinstance(n.right, ast.Constant) \
                and n.right.value == 0.5:
            return True
        if isinstance(n, ast.Call):
            f = n.func
            name = f.attr if isinstance(f, ast.Attribute) else f.id if isinstance(f, ast.Name) else ''
            if name in ('sqrt', 'isqrt'):
                return True
    return False


def _has_log(node):
    for n in ast.walk(node):
        if isinstance(n, ast.Call):
            f = n.func
            name = f.attr if isinstance(f, ast.Attribute) else f.id if isinstance(f, ast.Name) else ''
            if name in ('log', 'log2', 'log10', 'bit_length'):
                return True
    return False


def _data_exit(stmts):
    """A return/break under an if that looks at the data (a[i] == x): an early finish."""
    for s in stmts:
        for n in [s] + list(_walk_scope(s)):
            if isinstance(n, ast.If) and any(isinstance(m, (ast.Return, ast.Break))
                                             for b in n.body for m in [b] + list(_walk_scope(b))):
                return True
    return False


class Deriver:
    def __init__(self, tree, code):
        self.tree = tree
        self.lines = code.split('\n')
        self.funcs = {f.name: f for f in ast.walk(tree) if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))}
        self.sets = set(SET_NAMES)
        for n in ast.walk(tree):
            if isinstance(n, ast.Assign):
                v = n.value
                is_set = isinstance(v, (ast.Set, ast.Dict, ast.SetComp, ast.DictComp)) or (
                    isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id in SET_MAKERS)
                if is_set:
                    for t in n.targets:
                        if isinstance(t, ast.Name):
                            self.sets.add(t.id)
        self.done = {}
        self.active = set()
        self.steps = []
        self.seen_lines = set()
        self.unsure = []
        self.hidden = False
        self.graph = False
        self.drain = 0
        self.skip = set()

    def code(self, node):
        return self.lines[node.lineno - 1].strip() if 0 < node.lineno <= len(self.lines) else ''

    def note(self, node, kind, record, **info):
        if not record:
            return
        key = (node.lineno, kind)
        if key in self.seen_lines:
            return
        self.seen_lines.add(key)
        self.steps.append(dict({'line': node.lineno, 'code': self.code(node), 'kind': kind}, **info))

    # ---- expressions: built-ins and calls hidden inside a line ----
    def expr(self, node, best, record):
        cost = C1
        if node is None:
            return cost
        for n in ast.walk(node):
            if isinstance(n, (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)):
                count = C1
                inner = C1
                for g in n.generators:
                    count = c_mul(count, self.iterations(g.iter, best, record, n))
                    for cond in g.ifs:
                        inner = max(inner, self.expr(cond, best, False))
                elt = n.elt if not isinstance(n, ast.DictComp) else n.value
                inner = max(inner, self.expr(elt, best, False))
                count = c_mul(count, inner)
                cost = max(cost, count)
                if record and count != C1:
                    self.note(n, 'comprehension', record, cost=c_label(count))
            elif isinstance(n, ast.Call):
                f = n.func
                if isinstance(f, ast.Name) and f.id in self.funcs:
                    c = self.function(f.id, best, record)
                    cost = max(cost, c)
                    if c != C1:
                        self.note(n, 'call', record, fn=f.id, cost=c_label(c, self.graph))
                elif isinstance(f, ast.Name) and f.id == 'sorted' or (
                        isinstance(f, ast.Attribute) and f.attr == 'sort'):
                    cost = max(cost, CNLOGN)
                    self.hidden = True
                    self.note(n, 'builtin', record, name='sorted' if isinstance(f, ast.Name) else 'sort',
                              cost='O(n log n)')
                elif isinstance(f, ast.Name) and f.id in LINEAR_BUILTINS and len(n.args) == 1:
                    cost = max(cost, CN)
                    self.hidden = True
                    self.note(n, 'builtin', record, name=f.id, cost='O(n)')
                elif isinstance(f, ast.Attribute) and (f.attr in LINEAR_METHODS or (
                        f.attr == 'pop' and n.args and not isinstance(n.args[0], ast.UnaryOp))):
                    cost = max(cost, CN)
                    self.hidden = True
                    self.note(n, 'builtin', record, name=f.attr, cost='O(n)')
            elif isinstance(n, ast.Compare):
                for op, right in zip(n.ops, n.comparators):
                    if isinstance(op, (ast.In, ast.NotIn)):
                        if isinstance(right, ast.Name) and right.id in self.sets:
                            continue
                        if isinstance(right, (ast.Dict, ast.Set)):
                            continue
                        if isinstance(right, ast.Call) and isinstance(right.func, ast.Attribute) \
                                and right.func.attr in ('keys', 'values', 'items'):
                            continue
                        if isinstance(right, (ast.Constant, ast.Tuple)) and not isinstance(right, ast.Name):
                            continue
                        cost = max(cost, CN)
                        self.hidden = True
                        self.note(n, 'in-list', record, cost='O(n)')
            elif isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Slice):
                cost = max(cost, CN)
                self.note(n, 'slice', record, cost='O(n)')
            elif isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and (
                    isinstance(n.left, (ast.List, ast.Constant)) and isinstance(n.right, ast.Name)
                    or isinstance(n.right, (ast.List, ast.Constant)) and isinstance(n.left, ast.Name)):
                cost = max(cost, CN)
        return cost

    # ---- how many times a loop runs ----
    def iterations(self, it, best, record, at):
        if isinstance(it, (ast.List, ast.Tuple, ast.Set)) and all(isinstance(e, ast.Constant) for e in it.elts):
            return C1
        if isinstance(it, ast.Constant):
            return C1
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == 'range':
            args = it.args
            if all(isinstance(a, ast.Constant) for a in args):
                return C1
            if any(_has_sqrt(a) for a in args):
                return CSQRT
            if any(_has_log(a) for a in args):
                return CLOG
            if len(args) == 3 and isinstance(args[2], ast.Name):
                # range(i * i, n, i): n / i rounds, summed over i (the sieve's harmonic sum).
                return (0, 0, 0, 1) if isinstance(args[0], ast.BinOp) else CLOG
            return CN
        if self.drain and isinstance(it, ast.Subscript):
            # Neighbours inside a queue/stack loop: every edge is looked at once in total.
            self.graph = True
            return C1
        return CN

    def harmonic(self, s):
        """for j in range(i * i, n, i) inside for i: n/i rounds each, n log log n (or n log n) in all."""
        outer = set(_names(s.target))
        for m in [x for b in s.body for x in [b] + list(_walk_scope(b))]:
            if isinstance(m, ast.For) and isinstance(m.iter, ast.Call) and isinstance(m.iter.func, ast.Name)                     and m.iter.func.id == 'range' and len(m.iter.args) == 3                     and isinstance(m.iter.args[2], ast.Name) and m.iter.args[2].id in outer:
                return m, isinstance(m.iter.args[0], ast.BinOp)
        return None

    def loop_for(self, s, best, record):
        harm = self.harmonic(s)
        if harm:
            child, sieve = harm
            inner = self.block(child.body, best, record)
            self.skip.add(id(child))
            rest = c_mul(self.iterations(s.iter, best, record, s), self.block(s.body, best, record))
            self.skip.discard(id(child))
            total = max(rest, c_mul((0, 1, 0, 1) if sieve else CNLOGN, inner))
            self.note(s, 'harmonic', record, cost=c_label(total))
            return total
        count = self.iterations(s.iter, best, record, s)
        head = self.expr(s.iter, best, record)
        body = self.block(s.body, best, record)
        if best and _data_exit(s.body):
            count = C1
        total = max(head, c_mul(count, body))
        self.note(s, 'for', record, iters=c_label(count), body=c_label(body, self.graph),
                  cost=c_label(total, self.graph))
        return total

    def loop_while(self, s, best, record):
        names = set(_names(s.test))
        body_nodes = [m for b in s.body for m in [b] + list(_walk_scope(b))]
        kind, count = 'while-unknown', CN
        mids = [m for m in body_nodes if isinstance(m, ast.Assign) and len(m.targets) == 1
                and isinstance(m.targets[0], ast.Name) and _halves(m.value)]
        squares = any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and isinstance(n.left, ast.Name)
                      and isinstance(n.right, ast.Name) and n.left.id == n.right.id for n in ast.walk(s.test)) \
            or any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Pow) and isinstance(n.right, ast.Constant)
                   and n.right.value == 2 for n in ast.walk(s.test))
        if any(_halving(m, names) for m in body_nodes) or (mids and any(
                isinstance(m, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in m.targets)
                and mids[0].targets[0].id in _names(m.value) for m in body_nodes)):
            kind, count = 'while-halve', CLOG
        elif any(isinstance(m, ast.Assign) and isinstance(m.value, ast.Tuple)
                 and any(isinstance(e, ast.BinOp) and isinstance(e.op, ast.Mod) for e in m.value.elts)
                 for m in body_nodes):
            kind, count = 'while-mod', CLOG
        elif squares and any(_stepping(m, names) for m in body_nodes):
            kind, count = 'while-sqrt', CSQRT
        elif any(_stepping(m, names) for m in body_nodes):
            constant = isinstance(s.test, ast.Compare) and all(isinstance(c, ast.Constant) for c in s.test.comparators)
            kind, count = ('while-constant', C1) if constant else ('while-step', CN)
        elif any(_drains(m, names) for m in body_nodes) or (
                isinstance(s.test, ast.Call) and any(_drains(m, set(_names(s.test))) for m in body_nodes)):
            kind, count = 'while-drain', CN
        else:
            self.unsure.append(s.lineno)
        if best and (_data_exit(s.body) or any(isinstance(n, ast.Subscript) for n in ast.walk(s.test))):
            count = C1
        if kind == 'while-drain':
            self.drain += 1
        body = self.block(s.body, best, record)
        if kind == 'while-drain':
            self.drain -= 1
        total = max(self.expr(s.test, best, record), c_mul(count, body))
        self.note(s, kind, record, iters=c_label(count), body=c_label(body, self.graph),
                  cost=c_label(total, self.graph))
        return total

    def block(self, stmts, best, record):
        cost = C1
        for s in stmts:
            if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom))                     or id(s) in self.skip:
                continue
            if isinstance(s, ast.For):
                c = self.loop_for(s, best, record)
            elif isinstance(s, ast.While):
                c = self.loop_while(s, best, record)
            elif isinstance(s, ast.If):
                c = max(self.expr(s.test, best, record), self.block(s.body, best, record),
                        self.block(s.orelse, best, record))
            elif isinstance(s, (ast.With, ast.Try)):
                c = self.block(s.body, best, record)
                for h in getattr(s, 'handlers', []):
                    c = max(c, self.block(h.body, best, record))
            else:
                c = self.expr(s, best, record)
            cost = max(cost, c)
        return cost

    # ---- functions and recursion ----
    def function(self, name, best, record):
        key = (name, best)
        if key in self.done:
            return self.done[key]
        if name in self.active:
            return C1  # a self-call: solved by its recurrence in recursive()
        self.active.add(name)
        f = self.funcs[name]
        calls, _ = _path_calls(f.body, name)
        if calls:
            cost = self.recursive(f, calls, best, record)
        else:
            cost = self.block(f.body, best, record)
        self.active.discard(name)
        self.done[key] = cost
        return cost

    def recursive(self, f, calls, best, record):
        name = f.name
        work = self.block(f.body, best, record)
        sites = [n for n in _walk_scope(f) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                 and n.func.id == name]
        args = [a for c in sites for a in c.args]
        mids = {m.targets[0].id for m in _walk_scope(f) if isinstance(m, ast.Assign) and len(m.targets) == 1
                and isinstance(m.targets[0], ast.Name) and _halves(m.value)}
        halves = any(_halves(a) for a in args) or any(
            isinstance(n, ast.Name) and n.id in mids for a in args for n in ast.walk(a)) or any(
            isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Slice)
            and any(isinstance(m, ast.Name) and m.id in mids for m in ast.walk(n.slice)) for a in args for n in ast.walk(a))
        mod = any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mod) for a in args for n in ast.walk(a))
        shrinks = any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Sub) for a in args for n in ast.walk(a)) \
            or any(isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Slice) for a in args for n in ast.walk(a)) \
            or any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Add) for a in args for n in ast.walk(a))
        in_loop = any(isinstance(n, (ast.For, ast.While)) and any(
            isinstance(m, ast.Call) and isinstance(m.func, ast.Name) and m.func.id == name
            for m in ast.walk(n)) for n in _walk_scope(f))
        visited = any(isinstance(n, ast.Compare) and any(isinstance(o, (ast.In, ast.NotIn)) for o in n.ops)
                      for n in _walk_scope(f))
        memo = any(isinstance(d, ast.Name) and d.id in ('cache', 'lru_cache') or
                   isinstance(d, ast.Call) and isinstance(d.func, (ast.Name, ast.Attribute)) and
                   getattr(d.func, 'id', getattr(d.func, 'attr', '')) == 'lru_cache' or
                   isinstance(d, ast.Attribute) and d.attr in ('cache', 'lru_cache')
                   for d in f.decorator_list) or (visited and any(
                       isinstance(n, ast.Assign) and any(isinstance(t, ast.Subscript) for t in n.targets)
                       for n in _walk_scope(f)) and not in_loop)
        partitions = calls >= 2 and any(isinstance(n, ast.ListComp) and any(g.ifs for g in n.generators)
                                        for n in _walk_scope(f))
        if partitions:
            # Quick sort: halves when the pivot is lucky, one item off when it is not.
            cost, how = (c_mul(CLOG, work) if best else c_mul(CN, work)), 'recursion-partition'
        elif in_loop and visited:
            self.graph = True
            # Each node is entered once (visited) and each edge looked at once: V + E in all.
            cost, how = CN, 'recursion-graph'
        elif in_loop:
            cost, how = CEXP, 'recursion-branching'
        elif memo:
            cost, how = c_mul(CN, work), 'recursion-memo'
        elif halves or mod:
            k = work[1] if not work[0] else 0
            a = calls
            import math as _m
            p = _m.log2(a) if a > 0 else 0
            if abs(p - k) < 1e-9:
                cost = c_mul(work, CLOG)
            elif p < k:
                cost = work
            else:
                cost = (0, p, 0, 0) if p != int(p) else (0, int(p), 0, 0)
            how = 'recursion-half' if not mod else 'recursion-mod'
            if mod:
                cost = CLOG
        elif shrinks:
            cost, how = (c_mul(CN, work), 'recursion-step') if calls == 1 else (CEXP, 'recursion-branching')
        else:
            self.unsure.append(f.lineno)
            cost, how = c_mul(CN, work), 'recursion-unknown'
        if best and _data_exit(f.body) and calls == 1 and (halves or shrinks):
            # if arr[mid] == target: return mid (or the first item matches): found at once.
            if any(isinstance(n, ast.Compare) and any(isinstance(m, ast.Subscript) for m in ast.walk(n))
                   for n in _walk_scope(f)):
                cost = C1
        self.note(f, how, record, fn=name, calls=calls, work=c_label(work), cost=c_label(cost, self.graph))
        return cost

    def run(self):
        top = self.block(self.tree.body, False, True)
        top_best = self.block(self.tree.body, True, False)
        called = {n.func.id for n in ast.walk(self.tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
        loose = [f for f in self.funcs if f not in called]
        # Only functions, never called: the answer is the functions' own cost.
        for name in loose:
            c = self.function(name, False, True)
            top = max(top, c)
            top_best = max(top_best, self.function(name, True, False))
        self.steps.sort(key=lambda s: s['line'])
        return {'worst': c_label(top, self.graph), 'best': c_label(min(top_best, top), self.graph),
                'steps': self.steps, 'unsure': sorted(set(self.unsure)), 'hidden': self.hidden,
                'graph': self.graph}


def _calls_in(node, name):
    return sum(1 for n in ast.walk(node) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
               and n.func.id == name)


def _path_calls(stmts, name):
    """Self-calls on the busiest path through stmts (an if and its else are not both taken)."""
    done, cur = 0, 0
    for s in stmts:
        if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        if isinstance(s, ast.If):
            c = _calls_in(s.test, name)
            b1, t1 = _path_calls(s.body, name)
            b2, t2 = _path_calls(s.orelse, name)
            if t1 and t2:
                return max(done, cur + c + max(b1, b2)), True
            if t1:
                done = max(done, cur + c + b1)
                cur += c + b2
            elif t2:
                done = max(done, cur + c + b2)
                cur += c + b1
            else:
                cur += c + max(b1, b2)
        elif isinstance(s, ast.Return):
            return max(done, cur + (_calls_in(s.value, name) if s.value else 0)), True
        elif isinstance(s, (ast.For, ast.While)):
            inner, _ = _path_calls(s.body, name)
            cur += inner + _calls_in(s.iter if isinstance(s, ast.For) else s.test, name)
        else:
            cur += _calls_in(s, name)
    return max(done, cur), False


def derive(tree, code):
    try:
        return Deriver(tree, code).run()
    except RecursionError:
        return None
`;
