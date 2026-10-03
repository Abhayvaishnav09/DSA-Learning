/**
 * Measures how the work grows (docs/07-code-execution.md §1): finds the program's input (a list
 * written in the code, a number like n, or what input() reads; or, for a file that only defines
 * functions, a call it makes up), doubles it from 8 up to 8192 and counts the lines that run.
 * Searching code also gets the key moved to the first, middle and last place and out of the
 * list; sorting code gets sorted, reversed and shuffled lists; number inputs are tried as powers
 * of two and as primes. The player fits a growth curve to these counts and checks it against
 * the derivation (derive.ts).
 */
export const MEASURE_PY = String.raw`
import copy as _copy, random as _random, time as _time

MEASURE_CAP = 200000
MEASURE_SECONDS = 4.0
# Up to 8192, so slow growth (n against n log n) has room to show.
LIST_SIZES = [8 * 2 ** i for i in range(11)]
NUMBER_SIZES = [2 ** i for i in range(1, 14)]
MISSING = {'num': -1, 'str': 'zzzz-missing'}


def _kind(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return 'num'
    if isinstance(v, str):
        return 'str'
    return None


def _top_level(tree):
    """Module-level nodes only (not inside functions or classes)."""
    out = []
    for st in tree.body:
        if isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        out.append(st)
        out.extend(_walk_scope(st))
    return out


def _key_params(f):
    """Parameters the function compares with the data: arr[mid] == target, item == wanted."""
    loop_vars = set()
    for n in _walk_scope(f):
        if isinstance(n, ast.For):
            loop_vars.update(_names(n.target))
    params = {a.arg for a in f.args.args}
    out = set()
    for n in _walk_scope(f):
        if isinstance(n, ast.Compare):
            names = set(_names(n))
            bases = {m.value.id for m in ast.walk(n) if isinstance(m, ast.Subscript) and isinstance(m.value, ast.Name)}
            if bases or names & loop_vars:
                out.update((names & params) - loop_vars - bases)
    return out


def _stop_arg(call):
    """range(n) and range(2, n): the n that sets how many rounds."""
    if len(call.args) == 1:
        return call.args[0]
    if len(call.args) >= 2:
        return call.args[1]
    return None


def _literal(e):
    """A plain value written in the code: 5, "a", or -2 (which Python parses as minus 2)."""
    if isinstance(e, ast.Constant):
        return True, e.value
    if isinstance(e, ast.UnaryOp) and isinstance(e.op, ast.USub) and isinstance(e.operand, ast.Constant)             and _kind(e.operand.value) == 'num':
        return True, -e.operand.value
    return False, None


def _as_list(v, name, where):
    if isinstance(v, ast.List) and len(v.elts) >= 2 and all(_literal(e)[0] for e in v.elts):
        values = [_literal(e)[1] for e in v.elts]
        kinds = {_kind(x) for x in values}
        if len(kinds) == 1 and None not in kinds:
            return {'name': name, 'at': where[id(v)], 'kind': kinds.pop(), 'values': values,
                    'asc': values == sorted(values)}
    return None


def _as_graph(v, name, where):
    """{node: [neighbours]}: an adjacency list written in the code."""
    if isinstance(v, ast.Dict) and len(v.keys) >= 2 and all(isinstance(k, ast.Constant) for k in v.keys) \
            and all(isinstance(x, ast.List) and all(isinstance(e, ast.Constant) for e in x.elts) for x in v.values):
        return {'name': name, 'at': where[id(v)], 'first': v.keys[0].value}
    return None


def plan_for(tree, synthetic=False):
    nodes = list(ast.walk(tree))
    where = {id(n): i for i, n in enumerate(nodes)}
    funcs = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    lists, scalars, graphs = [], {}, []
    for st in tree.body:
        if not (isinstance(st, ast.Assign) and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name)):
            continue
        name, v = st.targets[0].id, st.value
        found = _as_list(v, name, where)
        if found:
            lists.append(found)
        elif isinstance(v, ast.Constant) and _kind(v.value):
            scalars[name] = {'at': where[id(v)], 'value': v.value, 'kind': _kind(v.value)}
        else:
            g = _as_graph(v, name, where)
            if g:
                graphs.append(g)

    top = _top_level(tree)
    calls = [n for n in top if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in funcs]
    # A list written straight into the call: bubble([5, 1, 4, 2]).
    for c in calls:
        for a in c.args:
            found = _as_list(a, c.func.id + '(…)', where)
            if found:
                lists.append(found)
    in_range = set()
    for n in top:
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'range' and _stop_arg(n):
            in_range.update(_names(_stop_arg(n)))

    if lists:
        first = lists[0]
        list_names = {l['name'] for l in lists}
        list_nodes = {l['at'] for l in lists}
        keys, original_key = [], None
        # The top level comparing a value with the data: if x == target.
        top_compares = set()
        for n in top:
            if isinstance(n, ast.Compare):
                top_compares.update(_names(n))
        for k, s in scalars.items():
            if s['kind'] == first['kind'] and k not in in_range and k not in list_names and k in top_compares:
                keys.append(s['at'])
                original_key = s['value'] if original_key is None else original_key
        # Passed next to the list into a parameter the function compares: search(nums, 23).
        for c in calls:
            if not any((isinstance(a, ast.Name) and a.id in list_names) or where.get(id(a)) in list_nodes
                       for a in c.args):
                continue
            params = [p.arg for p in funcs[c.func.id].args.args]
            wanted = _key_params(funcs[c.func.id])
            for i, a in enumerate(c.args):
                if i >= len(params) or params[i] not in wanted:
                    continue
                if isinstance(a, ast.Constant) and _kind(a.value) == first['kind']:
                    keys.append(where[id(a)])
                    original_key = a.value
                elif isinstance(a, ast.Name) and a.id in scalars and scalars[a.id]['kind'] == first['kind']:
                    keys.append(scalars[a.id]['at'])
                    original_key = scalars[a.id]['value']
        return {'mode': 'list', 'lists': lists, 'keys': sorted(set(keys)), 'originalKey': original_key,
                'scaled': [l['name'] for l in lists]}

    if graphs:
        return {'mode': 'graph', 'graph': graphs[0], 'scaled': [graphs[0]['name']]}

    sizes, scaled = [], []
    for k, s in scalars.items():
        if s['kind'] == 'num' and isinstance(s['value'], int) and s['value'] >= 2 and k in in_range:
            sizes.append(s['at'])
            scaled.append(k)
    for n in top:
        if not (isinstance(n, ast.Call) and isinstance(n.func, ast.Name)):
            continue
        args = [_stop_arg(n)] if n.func.id == 'range' else n.args if n.func.id in funcs else []
        for a in args:
            if isinstance(a, ast.Constant) and isinstance(a.value, int) and not isinstance(a.value, bool) \
                    and a.value >= 2:
                sizes.append(where[id(a)])
                scaled.append(n.func.id + '(' + repr(a.value) + ')')
        # fib(n) with n = 10 written above.
        if n.func.id in funcs:
            for a in n.args:
                if isinstance(a, ast.Name) and a.id in scalars and scalars[a.id]['kind'] == 'num' \
                        and isinstance(scalars[a.id]['value'], int) and scalars[a.id]['at'] not in sizes:
                    sizes.append(scalars[a.id]['at'])
                    scaled.append(a.id)
    if sizes:
        return {'mode': 'size', 'sizes': sizes, 'scaled': scaled}

    # Text passed to a function: is_palindrome("racecar").
    texts, text_names = [], []
    for c in calls:
        for a in c.args:
            if isinstance(a, ast.Constant) and isinstance(a.value, str) and len(a.value) >= 2:
                texts.append(where[id(a)])
                text_names.append(c.func.id + '(…)')
            elif isinstance(a, ast.Name) and a.id in scalars and scalars[a.id]['kind'] == 'str':
                texts.append(scalars[a.id]['at'])
                text_names.append(a.id)
    if texts:
        return {'mode': 'text', 'texts': texts, 'scaled': text_names}

    sites = _input_sites(tree)
    if sites:
        return {'mode': 'input', 'sites': sites, 'scaled': ['input()']}
    if not synthetic:
        return _call_plan(tree)
    return None


def _input_sites(tree):
    """What each input() line reads: a number, a list of numbers, words, or text."""
    parents = {}
    for p in ast.walk(tree):
        for c in ast.iter_child_nodes(p):
            parents[id(c)] = p
    sites = {}
    for n in ast.walk(tree):
        if not (isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'input'):
            continue
        kind, cur = 'text', n
        for _ in range(8):
            p = parents.get(id(cur))
            if p is None or isinstance(p, ast.stmt):
                break
            if isinstance(p, ast.Call) and isinstance(p.func, ast.Name) and p.func.id in ('int', 'float') \
                    and kind == 'text':
                kind = 'num'
                break
            if isinstance(p, ast.Attribute) and p.attr == 'split':
                kind = 'word-list'
            if isinstance(p, ast.Call) and isinstance(p.func, ast.Name) and p.func.id == 'map' and p.args \
                    and isinstance(p.args[0], ast.Name) and p.args[0].id in ('int', 'float'):
                kind = 'num-list'
                break
            if isinstance(p, (ast.ListComp, ast.GeneratorExp)) and kind == 'word-list' and any(
                    isinstance(x, ast.Call) and isinstance(x.func, ast.Name) and x.func.id in ('int', 'float')
                    for x in ast.walk(p.elt)):
                kind = 'num-list'
                break
            cur = p
        sites.setdefault(n.lineno, kind)
    return sites


LOW_NAMES = {'lo', 'low', 'left', 'l', 'start', 'begin'}
HIGH_NAMES = {'hi', 'high', 'right', 'r', 'end'}


def _call_plan(tree):
    """Only functions, never called: call the last one ourselves with made-up inputs."""
    if any(isinstance(n, ast.Call) for st in tree.body
           if not isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom))
           for n in ast.walk(st)):
        return None
    funcs = [st for st in tree.body if isinstance(st, ast.FunctionDef)]
    if not funcs:
        return None
    called = {n.func.id for f in funcs for n in ast.walk(f) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    roots = [f for f in funcs if f.name not in called] or funcs
    f = roots[-1]
    params = [a.arg for a in f.args.args]
    body = list(_walk_scope(f))
    kinds = {}
    for p in params:
        is_list = any(isinstance(n, ast.For) and (
            (isinstance(n.iter, ast.Name) and n.iter.id == p) or _len_of(n.iter) == p or (
                isinstance(n.iter, ast.Call) and n.iter.args and isinstance(n.iter.args[0], ast.Name)
                and n.iter.args[0].id == p and getattr(n.iter.func, 'id', '') in ('enumerate', 'reversed', 'sorted')))
            for n in body) or any(_sub(n) and _sub(n)[0] == p for n in body) or any(
            isinstance(n, ast.Call) and getattr(n.func, 'id', '') == 'len' and n.args
            and isinstance(n.args[0], ast.Name) and n.args[0].id == p for n in body) or any(
            isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == p for n in body) or any(
            isinstance(n, ast.Compare) and any(isinstance(o, (ast.In, ast.NotIn)) for o in n.ops)
            and any(isinstance(c, ast.Name) and c.id == p for c in n.comparators) for n in body)
        kinds[p] = 'list' if is_list else 'num'
    lists = [p for p in params if kinds[p] == 'list']
    lines = []
    for p in params:
        if kinds[p] == 'list':
            lines.append(p + ' = [0, 3, 6]')
        elif lists and p in LOW_NAMES:
            lines.append(p + ' = int(0)')
        elif lists and p in HIGH_NAMES:
            lines.append(p + ' = len(' + lists[0] + ') - 1')
        elif lists and any(isinstance(n, ast.Compare) and p in _names(n) for n in body):
            lines.append(p + ' = 3')
        elif lists:
            lines.append(p + ' = int(1)')
        else:
            lines.append(p + ' = 2')
    call = f.name + '(' + ', '.join(params) + ')'
    lines.append(call)
    made = ast.parse(ast.unparse(tree) + '\n' + '\n'.join(lines) + '\n', FILE)
    plan = plan_for(made, synthetic=True)
    if plan:
        plan['tree'] = made
        plan['call'] = call
    return plan


def _values(kind, m, order, seed):
    base = [i * 3 for i in range(m)] if kind == 'num' else ['item%04d' % i for i in range(m)]
    if order == 'desc':
        return base[::-1]
    if order == 'shuffle':
        r = base[:]
        _random.Random(seed).shuffle(r)
        return r
    return base


def _next_prime(n):
    def prime(p):
        if p < 2:
            return False
        i = 2
        while i * i <= p:
            if p % i == 0:
                return False
            i += 1
        return True
    while not prime(n):
        n += 1
    return n


def _key(values, label, kind):
    m = len(values)
    if label == 'first':
        return values[0]
    if label == 'middle':
        return values[(m - 1) // 2]
    if label == 'last':
        return values[-1]
    if label == 'missing':
        return MISSING[kind]
    return None


ORDERS = {'sorted': 'asc', 'reversed': 'desc', 'shuffled': 'shuffle'}


class _Inputs:
    """Answers input() during measuring: n, then the list, then the key, sized for this run."""

    def __init__(self, sites, m, label, produced=None):
        self.sites, self.m, self.label = sites, m, label
        self.produced = produced
        self.asked_key = False
        self.made_list = False

    def __call__(self, prompt=''):
        f = sys._getframe(1)
        line = f.f_lineno if f.f_code.co_filename == FILE else 0
        kind = self.sites.get(line, 'text')
        if kind == 'num':
            if self.produced is None:
                return str(_next_prime(self.m) if self.label == 'prime' else self.m)
            self.asked_key = True
            key = _key(self.produced, self.label, 'num')
            return str(key if key is not None else self.produced[(len(self.produced) - 1) // 2])
        if kind in ('num-list', 'word-list'):
            self.made_list = True
            self.produced = _values('num' if kind == 'num-list' else 'str', self.m,
                                    ORDERS.get(self.label, 'asc'), 7)
            return ' '.join(str(v) for v in self.produced)
        return 'a' * self.m


def _blocked_import(name, *args, **kwargs):
    if name.split('.')[0] in BLOCKED:
        raise ImportError('module ' + name + ' is not available here')
    return builtins.__import__(name, *args, **kwargs)


def _count_steps(tree, answer):
    count = [0]

    class Sink:
        def write(self, s):
            return len(s)

        def flush(self):
            pass

    def local(frame, event, arg):
        if event == 'line':
            count[0] += 1
            if count[0] > MEASURE_CAP:
                raise StepLimit()
        return local

    def start(frame, event, arg):
        if frame.f_code.co_filename != FILE:
            return None
        return local

    safe = dict(vars(builtins))
    safe['input'] = answer
    safe['__import__'] = _blocked_import
    real = sys.stdout
    sys.stdout = Sink()
    capped, failed = False, False
    sys.settrace(start)
    try:
        exec(compile(ast.fix_missing_locations(tree), FILE, 'exec'), {'__name__': '__main__', '__builtins__': safe})
    except StepLimit:
        capped = True
    except BaseException:
        failed = True
    finally:
        sys.settrace(None)
        sys.stdout = real
    return count[0], capped, failed


def _variant(tree, plan, m, label):
    """The program with its input made m big for this case, and what it reads from input()."""
    t = _copy.deepcopy(tree)
    nodes = list(ast.walk(t))
    sites = plan.get('sites') or _input_sites(t)
    if plan['mode'] == 'input':
        return t, _Inputs(sites, m, label)
    if plan['mode'] == 'graph':
        # A chain with shortcuts: node i links to i + 1 and i + 2, starting from the original first node.
        d = nodes[plan['graph']['at']]
        start = plan['graph']['first']
        names = [start] + ([start + i for i in range(1, m)] if isinstance(start, int) and not isinstance(start, bool)
                           else ['v%d' % i for i in range(1, m)])
        d.keys = [ast.copy_location(ast.Constant(x), d) for x in names]
        d.values = [ast.copy_location(ast.List(elts=[ast.Constant(names[j]) for j in (i + 1, i + 2) if j < m],
                                               ctx=ast.Load()), d) for i in range(m)]
        return t, _Inputs(sites, m, label)
    if plan['mode'] == 'text':
        rng = _random.Random(7)
        # same: one letter repeated (a palindrome, nothing stops early); mixed: random letters.
        text = 'a' * m if label == 'same' else 'b' + ''.join(rng.choice('abcdefgh') for _ in range(m - 2)) + 'c'
        for at in plan['texts']:
            nodes[at].value = text
        return t, _Inputs(sites, m, label)
    if plan['mode'] == 'size':
        value = _next_prime(m) if label == 'prime' else m
        for at in plan['sizes']:
            nodes[at].value = value
        return t, _Inputs(sites, m, label)
    first = plan['lists'][0]
    order = ORDERS.get(label) or ('asc' if first['asc'] else 'shuffle')
    for i, lst in enumerate(plan['lists']):
        values = _values(lst['kind'], m, order, 7 + i)
        nodes[lst['at']].elts = [ast.copy_location(ast.Constant(v), nodes[lst['at']]) for v in values]
    main = _values(first['kind'], m, order, 7)
    key = _key(main, label, first['kind'])
    if label == 'typical':
        original = first['values']
        pos = original.index(plan['originalKey'])
        key = main[round(pos / max(1, len(original) - 1) * (m - 1))]
    if key is not None:
        for at in plan['keys']:
            nodes[at].value = key
    return t, _Inputs(sites, m, label, produced=main)


def measure(code, stdin_text):
    try:
        tree = ast.parse(code, FILE)
    except SyntaxError:
        return json.dumps({'mode': None, 'series': []})
    plan = plan_for(tree)
    if not plan:
        return json.dumps({'mode': None, 'series': []})
    tree = plan.get('tree', tree)
    keyed = ['first', 'middle', 'last', 'missing']
    ordered = ['sorted', 'reversed', 'shuffled']
    if plan['mode'] == 'size':
        labels, sizes = ['even', 'prime'], NUMBER_SIZES
    elif plan['mode'] == 'graph':
        labels, sizes = ['graph'], LIST_SIZES
    elif plan['mode'] == 'text':
        labels, sizes = ['same', 'mixed'], LIST_SIZES
    elif plan['mode'] == 'input':
        # One small run shows what the program reads: a key after a list, a list, or just n.
        probe_tree, probe = _variant(tree, plan, 8, 'first')
        _count_steps(probe_tree, probe)
        if probe.asked_key:
            labels, sizes = keyed, LIST_SIZES
        elif probe.made_list:
            labels, sizes = ordered, LIST_SIZES
        else:
            labels, sizes = ['even', 'prime'], NUMBER_SIZES
    elif plan['keys']:
        labels, sizes = list(keyed), LIST_SIZES
        if plan['originalKey'] in plan['lists'][0]['values']:
            labels.append('typical')
    else:
        labels, sizes = ordered, LIST_SIZES
    start = _time.monotonic()
    deadline = start + MEASURE_SECONDS
    series, partial = [], False
    for index, label in enumerate(labels):
        # Each case gets its share of the time, so a slow first case cannot starve the rest.
        share = start + MEASURE_SECONDS * (index + 1) / len(labels)
        points, capped, failed, last = [], False, False, None

        def run(m):
            t, answer = _variant(tree, plan, m, label)
            n = _next_prime(m) if label == 'prime' and plan['mode'] in ('size', 'input') else m
            return (n,) + _count_steps(t, answer)

        for m in sizes:
            if _time.monotonic() > min(deadline, share):
                partial = True
                break
            began = _time.monotonic()
            n, steps, capped, failed = run(m)
            if capped or failed:
                last = m
                break
            points.append([n, steps])
            # Doubling again would take about 4 times longer: stop while it is still quick.
            if _time.monotonic() - began > 0.1:
                partial = True
                break
        # Growth too fast for doubling (2ⁿ): fill in the sizes between the last two.
        if capped and points and last and plan['mode'] != 'list' and len(points) < 8:
            lo = points[-1][0]
            step = max(1, (last - lo) // 4)
            m = lo + step
            while m < last and _time.monotonic() < min(deadline, share):
                n, steps, c2, f2 = run(m)
                if c2 or f2:
                    break
                points.append([n, steps])
                m += step
        if failed and len(points) >= 3:
            failed = False
        series.append({'label': label, 'points': points, 'capped': capped, 'failed': failed})
    out = {'mode': plan['mode'], 'scaled': plan['scaled'], 'series': series, 'partial': partial}
    if plan.get('call'):
        out['call'] = plan['call']
    return json.dumps(out)
`;
