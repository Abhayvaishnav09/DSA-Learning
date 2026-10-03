import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { boxKey, viewText, type ViewFrame } from '../view';
import { framesFromTrace, type RawTrace } from './toFrames';
import { TRACER_PY } from './tracer';

/** The real tracer under real Pyodide (the browser runs the same code in a Worker). */
let trace: (code: string, stdin?: string) => RawTrace;

beforeAll(async () => {
  const py = await loadPyodide();
  py.runPython(TRACER_PY);
  const fn = py.globals.get('trace') as (code: string, stdin: string) => string;
  trace = (code, stdin = '') => JSON.parse(fn(code, stdin)) as RawTrace;
}, 120_000);

const FIND_PAPER = `def find_paper(papers, name):
    for p in papers:
        if p == name:
            return True
    return False

papers = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Hannah", "Ian", "Jack"]
target = "TARGET"
result = find_paper(papers, target)
print(f"Is '{target}' in papers list? {result}")
`;

const run = (code: string, stdin?: string) => framesFromTrace(trace(code, stdin), code);
const valueOf = (frame: ViewFrame, name: string) => {
  const box = frame.globals.find((b) => b.name === name);
  return box ? viewText(box.value) : undefined;
};

describe('Python tracer', () => {
  it('walks find_paper like the linear-search lesson: 5 comparisons to find Emma', () => {
    const frames = run(FIND_PAPER.replace('TARGET', 'Emma'));
    const last = frames.at(-1)!;
    expect(last.output).toEqual(["Is 'Emma' in papers list? True"]);
    expect(last.checks).toBe(5);
    expect(valueOf(last, 'result')).toBe('True');

    // Checking "Bob": inside the call, Alice is crossed out and Bob is not equal.
    const bob = frames.find((f) => f.line === 3 && f.caption.en.includes("'Bob' == 'Emma'"))!;
    expect(bob.caption.en).toBe(
      `Is p == name  →  'Bob' == 'Emma'? No (False), so skip the "if" lines.`,
    );
    expect(bob.caption['hi-Latn']).toContain('Nahi (False)');
    expect(bob.marks[boxKey(0, 'papers')]).toMatchObject({
      0: { seen: true },
      1: { state: 'miss', pointers: ['p'] },
    });
    // The same list object at the top level shows the same marks.
    expect(bob.marks[boxKey(-1, 'papers')]).toEqual(bob.marks[boxKey(0, 'papers')]);

    // After the function returns, Emma stays found and the first four stay checked.
    expect(last.marks[boxKey(-1, 'papers')]).toEqual({
      0: { seen: true },
      1: { seen: true },
      2: { seen: true },
      3: { seen: true },
      4: { state: 'found', pointers: ['p'] },
    });
    const call = frames.find((f) => f.caption.en.startsWith('Call find_paper()'))!;
    expect(call.line).toBe(9);
    expect(call.stack.map((s) => s.name)).toEqual(['find_paper']);
  });

  it('checks all 10 names when the target is missing (the worst case)', () => {
    const frames = run(FIND_PAPER.replace('TARGET', 'Zara'));
    expect(frames.at(-1)!.checks).toBe(10);
    expect(frames.at(-1)!.output).toEqual(["Is 'Zara' in papers list? False"]);
    expect(frames.some((f) => f.caption.en.startsWith('No items left (all 10 done)'))).toBe(true);
  });

  it('labels lo, mid and hi in a binary search', () => {
    const frames = run(`arr = [1, 3, 5, 7, 9, 11]
lo, hi = 0, len(arr) - 1
target = 9
while lo <= hi:
    mid = (lo + hi) // 2
    if arr[mid] == target:
        break
    elif arr[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1
print(mid)`);
    expect(frames.at(-1)!.output).toEqual(['4']);
    const marks = frames.at(-1)!.marks[boxKey(-1, 'arr')]!;
    expect(marks[4]).toMatchObject({ state: 'found' });
    expect(marks[3]!.pointers).toEqual(['lo']);
    expect(marks[4]!.pointers).toEqual(['mid']);
    expect(marks[5]!.pointers).toEqual(['hi']);
  });

  it('shows the change a line made, in both languages', () => {
    const frames = run('total = 2\ntotal = total + 3\nnums = [1]\nnums.append(5)');
    expect(frames[2]!.caption.en).toBe('total changes from 2 to 5. The old value is gone.');
    expect(frames[4]!.caption['hi-Latn']).toBe('nums[1] ab 5 hai.');
    expect(frames[4]!.changed).toEqual({ depth: -1, name: 'nums' });
    expect(frames[4]!.changedIndex).toBe(1);
  });

  it('feeds input() from the Input box and reports errors with their line', () => {
    const frames = run('n = int(input("n? "))\nprint(n * 2)\nprint(n / 0)', '21');
    const last = frames.at(-1)!;
    expect(last.output).toEqual(['n? 21', '42']);
    expect(last.line).toBe(3);
    expect(last.error?.en).toBe(
      'Line 3: ZeroDivisionError: division by zero. A number cannot be divided by 0.',
    );
  });

  it('stops endless loops, blocks the page bridge and explains syntax errors', () => {
    expect(trace('while True:\n    pass').error).toMatchObject({ type: 'StepLimit', line: 1 });
    expect(trace('import js').error).toMatchObject({ type: 'ImportError', line: 1 });
    expect(trace('from pyodide.ffi import to_js').error).toMatchObject({ type: 'ImportError' });
    const broken = run('x = (1,\nprint(x)');
    expect(broken.at(-1)!.error?.en).toMatch(/^Line 1: the code is not valid Python/);
  });

  it('shows dictionaries, tuples and objects by their contents', () => {
    const frames = run(`class Node:
    def __init__(self, val):
        self.val = val
ages = {"Riya": 12}
pair = (1, "a")
n = Node(3)`);
    const last = frames.at(-1)!;
    expect(valueOf(last, 'ages')).toBe('{"Riya": 12}');
    expect(valueOf(last, 'pair')).toBe('(1, "a")');
    expect(valueOf(last, 'n')).toBe('Node(val=3)');
    expect(last.globals.map((b) => b.name)).not.toContain('Node');
  });
});

describe('algorithm-aware narration', () => {
  it('says how many items an early return skipped', () => {
    const frames = run(FIND_PAPER.replace('TARGET', 'Emma'));
    const stop = frames.find((f) => f.caption.en.includes('The loop stops early'))!;
    expect(stop.line).toBe(4);
    expect(stop.caption['hi-Latn']).toContain(
      'Loop beech me hi ruk gaya: 10 me se sirf 5 item check hue (5 comparison lage), baaki 5 check hi nahi hue.',
    );
  });

  it('follows the search area of a binary search as it halves', () => {
    const frames = run(`def search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

print(search([2, 5, 8, 12, 16, 23, 38, 56, 72, 91], 23))`);
    const captions = frames.map((f) => f.caption.en);
    expect(captions).toContain(
      'Is lo <= hi  →  0 <= 9? Yes (True), so run the loop lines again. Search area: arr[0..9], 10 of 10 items left.',
    );
    expect(
      captions.some((c) =>
        c.startsWith('Half thrown away: the search area goes from 10 to 5 items.'),
      ),
    ).toBe(true);
  });

  it('names a swap and the two values that traded places', () => {
    const frames = run('nums = [5, 1]\nnums[0], nums[1] = nums[1], nums[0]');
    expect(frames[2]!.caption.en).toBe('Swap: nums[0] and nums[1] trade places (5 ↔ 1).');
  });

  it('recognises algorithms by the shape of the code, and nothing when unsure', () => {
    const ids = (code: string) => trace(code).algorithms?.map((a) => a.id);
    expect(ids(FIND_PAPER)).toEqual(['linear-search']);
    expect(
      ids('def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(4))'),
    ).toEqual(['recursion']);
    expect(ids('x = 1\ny = x + 2\nprint(y)')).toEqual([]);
  });
});
