/**
 * Recognises common beginner algorithms from the shape of the code (Python's own `ast`), so the
 * player can explain them by name: linear and binary search, the three simple sorts, finding
 * the largest/smallest, adding up, recursion. Only clear matches count; anything else stays
 * unnamed rather than guessed.
 */
export const DETECT_PY = String.raw`

def _walk_scope(node):
    """Every node inside node, without going into nested functions or classes."""
    stack = list(ast.iter_child_nodes(node))
    while stack:
        n = stack.pop()
        yield n
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            stack.extend(ast.iter_child_nodes(n))


def _inside(loop):
    out = []
    for b in loop.body + getattr(loop, 'orelse', []):
        out.append(b)
        out.extend(_walk_scope(b))
    return out


def _sub(n):
    if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name):
        return n.value.id, n.slice
    return None


def _plus_one(idx, var):
    return (isinstance(idx, ast.BinOp) and isinstance(idx.op, ast.Add)
            and isinstance(idx.left, ast.Name) and idx.left.id == var
            and isinstance(idx.right, ast.Constant) and idx.right.value == 1)


def _halves(v):
    for n in ast.walk(v):
        if (isinstance(n, ast.BinOp) and isinstance(n.op, (ast.FloorDiv, ast.Div, ast.RShift))
                and isinstance(n.right, ast.Constant) and n.right.value in (1, 2)):
            return True
    return False


def _stores_subscript(stmt):
    if not isinstance(stmt, ast.Assign):
        return False
    for t in stmt.targets:
        if isinstance(t, ast.Subscript):
            return True
        if isinstance(t, ast.Tuple) and all(isinstance(e, ast.Subscript) for e in t.elts):
            return True
    return False


def _moves(m, name, op):
    """name += 1 or name -= 1 (op is ast.Add or ast.Sub), or name = name ± 1."""
    if isinstance(m, ast.AugAssign) and isinstance(m.target, ast.Name) and m.target.id == name:
        return isinstance(m.op, op)
    if isinstance(m, ast.Assign) and len(m.targets) == 1 and isinstance(m.targets[0], ast.Name) \
            and m.targets[0].id == name and isinstance(m.value, ast.BinOp) and isinstance(m.value.op, op):
        return name in _names(m.value.left)
    return False


def _loop_list(loop):
    """The list a for loop walks over, by name, or None."""
    it = loop.iter
    if isinstance(it, ast.Name):
        return it.id
    if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.args:
        if it.func.id == 'enumerate' and isinstance(it.args[0], ast.Name):
            return it.args[0].id
        if it.func.id == 'range' and len(it.args) == 1:
            return _len_of(it.args[0])
    return None


def identify(tree):
    found = []

    def add(kind, fn, **info):
        if not any(f['id'] == kind and f['fn'] == fn for f in found):
            found.append(dict({'id': kind, 'fn': fn}, **info))

    scopes = [('', tree)] + [(n.name, n) for n in ast.walk(tree)
                             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    for fn, scope in scopes:
        nodes = list(_walk_scope(scope))
        fors = [n for n in nodes if isinstance(n, ast.For)]
        whiles = [n for n in nodes if isinstance(n, ast.While)]
        before = len(found)

        # Binary search: while lo <= hi, mid = (lo + hi) // 2, then look at arr[mid].
        for w in whiles:
            t = w.test
            if not (isinstance(t, ast.Compare) and len(t.ops) == 1
                    and isinstance(t.ops[0], (ast.Lt, ast.LtE))
                    and isinstance(t.left, ast.Name) and isinstance(t.comparators[0], ast.Name)):
                continue
            body = _inside(w)
            mids = [m.targets[0].id for m in body if isinstance(m, ast.Assign)
                    and len(m.targets) == 1 and isinstance(m.targets[0], ast.Name) and _halves(m.value)]
            looked = [_sub(m)[0] for m in body if _sub(m) and isinstance(_sub(m)[1], ast.Name)
                      and _sub(m)[1].id in mids]
            if mids and looked:
                add('binary-search', fn, lo=t.left.id, hi=t.comparators[0].id, mid=mids[0],
                    list=looked[0], inclusive=isinstance(t.ops[0], ast.LtE))

        # Sorts: two loops, one inside the other.
        for outer in fors + whiles:
            inner_loops = [m for m in _inside(outer) if isinstance(m, (ast.For, ast.While))]
            if not inner_loops:
                continue
            for inner in inner_loops:
                body = _inside(inner)
                for cond in [m for m in body if isinstance(m, ast.If)]:
                    t = cond.test
                    if not (isinstance(t, ast.Compare) and len(t.ops) == 1
                            and isinstance(t.ops[0], (ast.Gt, ast.Lt, ast.GtE, ast.LtE))):
                        continue
                    a, b = _sub(t.left), _sub(t.comparators[0])
                    if not (a and b and a[0] == b[0]):
                        continue
                    ia, ib = a[1], b[1]
                    swaps = any(_stores_subscript(s) for s in cond.body)
                    adjacent = ((isinstance(ia, ast.Name) and _plus_one(ib, ia.id))
                                or (isinstance(ib, ast.Name) and _plus_one(ia, ib.id)))
                    if adjacent and swaps:
                        add('bubble-sort', fn, list=a[0])
                    elif (isinstance(ia, ast.Name) and isinstance(ib, ast.Name)
                          and any(isinstance(s, ast.Assign) and len(s.targets) == 1
                                  and isinstance(s.targets[0], ast.Name)
                                  and s.targets[0].id in (ia.id, ib.id)
                                  and isinstance(s.value, ast.Name) for s in cond.body)
                          and any(_stores_subscript(s) for s in _inside(outer))):
                        add('selection-sort', fn, list=a[0])
            # Insertion sort: shift bigger items right with a[j + 1] = a[j] inside a while.
            for inner in [m for m in inner_loops if isinstance(m, ast.While)]:
                for s in _inside(inner):
                    if (isinstance(s, ast.Assign) and len(s.targets) == 1 and _sub(s.targets[0])
                            and _sub(s.value) and _sub(s.targets[0])[0] == _sub(s.value)[0]
                            and isinstance(_sub(s.value)[1], ast.Name)
                            and _plus_one(_sub(s.targets[0])[1], _sub(s.value)[1].id)):
                        add('insertion-sort', fn, list=_sub(s.value)[0])

        for loop in fors:
            lst = _loop_list(loop)
            if not lst:
                continue
            loop_vars = set(_names(loop.target))
            for cond in [m for m in _inside(loop) if isinstance(m, ast.If)]:
                t = cond.test
                if not isinstance(t, ast.Compare):
                    continue
                uses = set(_names(t))
                exits = any(isinstance(m, (ast.Return, ast.Break))
                            for s in cond.body for m in [s] + list(_walk_scope(s)))
                # Linear search: compare each item with ==, stop when it matches.
                if any(isinstance(op, ast.Eq) for op in t.ops) and uses & loop_vars and exits:
                    add('linear-search', fn, list=lst, var=sorted(uses & loop_vars)[0])
                # Largest / smallest: if x > best: best = x.
                elif (len(t.ops) == 1 and isinstance(t.ops[0], (ast.Gt, ast.Lt, ast.GtE, ast.LtE))
                      and uses & loop_vars and not exits):
                    others = uses - loop_vars - {lst}
                    if any(isinstance(s, ast.Assign) and len(s.targets) == 1
                           and isinstance(s.targets[0], ast.Name) and s.targets[0].id in others
                           for s in cond.body):
                        add('find-extreme', fn, list=lst)

        found_here = lambda: [f for f in found[before:]]
        calls_of = lambda attr: [n for n in nodes if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                                 and n.func.attr == attr and isinstance(n.func.value, ast.Name)]
        adjacency = lambda loop: isinstance(loop.iter, ast.Subscript) and isinstance(loop.iter.value, ast.Name)

        # Two pointers: while left < right, one moves up and the other down (no middle).
        if not any(f['id'] == 'binary-search' for f in found_here()):
            for w in whiles:
                t = w.test
                if (isinstance(t, ast.Compare) and len(t.ops) == 1 and isinstance(t.ops[0], (ast.Lt, ast.LtE))
                        and isinstance(t.left, ast.Name) and isinstance(t.comparators[0], ast.Name)):
                    a, b = t.left.id, t.comparators[0].id
                    body = _inside(w)
                    if any(_moves(m, a, ast.Add) for m in body) and any(_moves(m, b, ast.Sub) for m in body):
                        add('two-pointers', fn)

        for loop in fors:
            body = _inside(loop)
            # Sliding window: the same running total gains a[i] and loses a[i - k].
            plus = {m.target.id for m in body if isinstance(m, ast.AugAssign) and isinstance(m.op, ast.Add)
                    and isinstance(m.target, ast.Name) and isinstance(m.value, ast.Subscript)}
            minus = {m.target.id for m in body if isinstance(m, ast.AugAssign) and isinstance(m.op, ast.Sub)
                     and isinstance(m.target, ast.Name) and isinstance(m.value, ast.Subscript)}
            if plus & minus:
                add('sliding-window', fn)
            for m in body:
                # Prefix sums: p[i + 1] = p[i] + a[i]; dynamic programming: dp[i] from dp[i - 1], dp[i - 2].
                if isinstance(m, ast.Assign) and len(m.targets) == 1 and _sub(m.targets[0]):
                    lst = _sub(m.targets[0])[0]
                    refs = [n for n in ast.walk(m.value) if _sub(n) and _sub(n)[0] == lst]
                    others = [n for n in ast.walk(m.value) if _sub(n) and _sub(n)[0] != lst]
                    if len(refs) == 1 and others and isinstance(m.value, ast.BinOp) and isinstance(m.value.op, ast.Add):
                        add('prefix-sum', fn)
                    elif len(refs) >= 2 or (refs and isinstance(m.value, ast.Call)):
                        add('dynamic-programming', fn)
                # Kadane: cur = max(x, cur + x).
                if (isinstance(m, ast.Assign) and len(m.targets) == 1 and isinstance(m.targets[0], ast.Name)
                        and isinstance(m.value, ast.Call) and isinstance(m.value.func, ast.Name)
                        and m.value.func.id in ('max', 'min')
                        and any(isinstance(a, ast.BinOp) and m.targets[0].id in _names(a) for a in m.value.args)):
                    add('kadane', fn)
                # Counting with a dictionary: d[x] = d.get(x, 0) + 1, d[x] += 1.
                if (isinstance(m, ast.Assign) and len(m.targets) == 1 and isinstance(m.targets[0], ast.Subscript)
                        and any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'get'
                                for n in ast.walk(m.value))) or (
                        isinstance(m, ast.AugAssign) and isinstance(m.target, ast.Subscript)
                        and isinstance(m.target.slice, ast.Name)):
                    add('hashing', fn)
            # Sieve: for j in range(i * i, n + 1, i) inside for i, crossing out multiples.
            outer = set(_names(loop.target))
            for m in body:
                if (isinstance(m, ast.For) and isinstance(m.iter, ast.Call) and isinstance(m.iter.func, ast.Name)
                        and m.iter.func.id == 'range' and len(m.iter.args) == 3
                        and isinstance(m.iter.args[2], ast.Name) and m.iter.args[2].id in outer):
                    add('sieve', fn)
            # Prime check: try divisors up to the square root.
            if isinstance(loop.iter, ast.Call) and any(_has_sqrt(a) for a in loop.iter.args) and any(
                    isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mod) for n in body):
                add('prime-check', fn)

        for w in whiles:
            body = _inside(w)
            if any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mult) and isinstance(n.left, ast.Name)
                   and isinstance(n.right, ast.Name) and n.left.id == n.right.id for n in ast.walk(w.test)) \
                    and any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mod) for n in body):
                add('prime-check', fn)
            # Euclid: a, b = b, a % b.
            if any(isinstance(m, ast.Assign) and isinstance(m.value, ast.Tuple)
                   and any(isinstance(e, ast.BinOp) and isinstance(e.op, ast.Mod) for e in m.value.elts) for m in body):
                add('gcd', fn)
            # Fast power: halve the exponent, look at its last bit.
            elif any(_halving(m, set(_names(w.test))) for m in body) and any(
                    isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mod) for n in body) and not any(
                    f['id'] == 'binary-search' for f in found_here()):
                add('fast-power', fn)
            # Breadth-first search: take from the front of a queue, add the neighbours.
            pops = [n for n in body if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                    and (n.func.attr == 'popleft' or (n.func.attr == 'pop' and n.args
                                                      and isinstance(n.args[0], ast.Constant) and n.args[0].value == 0))]
            stack_pops = [n for n in body if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                          and n.func.attr == 'pop' and not n.args]
            neighbours = any(isinstance(m, ast.For) and adjacency(m) for m in body)
            if pops and neighbours:
                add('bfs', fn)
            elif stack_pops and neighbours:
                add('dfs', fn)

        # Recursion: the function calls itself.
        if fn:
            calls = [n for n in nodes if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                     and n.func.id == fn]
            slices = any(isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Slice) for n in nodes)
            in_loop = any(any(isinstance(m, ast.Call) and isinstance(m.func, ast.Name) and m.func.id == fn
                              for m in ast.walk(l)) for l in fors + whiles)

            def _decorator(d):
                d = d.func if isinstance(d, ast.Call) else d
                return d.attr if isinstance(d, ast.Attribute) else d.id if isinstance(d, ast.Name) else ''

            memo = any(_decorator(d) in ('cache', 'lru_cache') for d in scope.decorator_list) or (
                any(isinstance(n, ast.Compare) and any(isinstance(o, ast.In) for o in n.ops) for n in nodes)
                and any(isinstance(n, ast.Assign) and any(isinstance(t, ast.Subscript) for t in n.targets)
                        for n in nodes))
            mid_names = {m.targets[0].id for m in nodes if isinstance(m, ast.Assign) and len(m.targets) == 1
                         and isinstance(m.targets[0], ast.Name) and _halves(m.value)}
            partitions = any(isinstance(n, ast.ListComp) and any(g.ifs for g in n.generators) for n in nodes)
            mod_args = any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mod)
                           for c in calls for a in c.args for n in ast.walk(a))
            merges = any(isinstance(w.test, ast.BoolOp) for w in whiles) or any(
                isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id.startswith('merge')
                and n.func.id != fn for n in nodes)
            if calls and in_loop and any(adjacency(l) for l in fors):
                add('dfs', fn)
            elif calls and mod_args:
                add('gcd', fn)
            elif calls and memo and not in_loop:
                add('memoization', fn)
            elif len(calls) >= 2 and partitions:
                add('quick-sort', fn)
            elif len(calls) >= 2 and slices and merges:
                add('merge-sort', fn)
            elif calls and mid_names and any(isinstance(a, ast.BinOp) and set(_names(a)) & mid_names
                                             for c in calls for a in c.args):
                add('binary-search', fn)
            elif len(calls) >= 2:
                add('divide-and-conquer' if slices else 'branching-recursion', fn)
            elif len(calls) == 1:
                add('recursion', fn)

        if len(found) == before:
            # Stack: push with append, take with pop() from the same list.
            pushed = {n.func.value.id for n in calls_of('append')}
            popped = {n.func.value.id for n in calls_of('pop') if not n.args}
            if pushed & popped:
                add('stack', fn)
            # Palindrome / reverse: s[::-1].
            if any(isinstance(n, ast.Subscript) and isinstance(n.slice, ast.Slice)
                   and isinstance(n.slice.step, ast.UnaryOp) for n in nodes):
                add('reverse', fn)
        if len(found) == before:
            # Every pair: a loop over a list inside another loop over a list.
            for loop in fors:
                if _loop_list(loop) and any(isinstance(m, ast.For) and _loop_list(m) for m in _inside(loop)):
                    add('nested-loops', fn)
                    break
        if len(found) == before:
            # Adding up or counting: total += x inside a loop over a list.
            for loop in fors:
                lst = _loop_list(loop)
                if lst and any(isinstance(m, ast.AugAssign) and isinstance(m.op, ast.Add)
                               and isinstance(m.target, ast.Name) for m in _inside(loop)):
                    add('accumulate', fn, list=lst)
                    break
    return found
`;
