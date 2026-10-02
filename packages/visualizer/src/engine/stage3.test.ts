import { describe, expect, it } from 'vitest';
import { caption } from './captions';
import type { PseudoError } from './parse';
import { evaluateExpression, finalVars, outputOf, run, traceRows } from './run';

const err = (source: string) => {
  try {
    run(source);
  } catch (e) {
    return e as PseudoError;
  }
  throw new Error('expected an error');
};

describe('else if', () => {
  it('picks the first true branch', () => {
    const grade = (n: number) =>
      outputOf(
        `marks = ${n}\nif marks >= 90:\n    say "A"\nelse if marks >= 60:\n    say "B"\nelse:\n    say "C"`,
      );
    expect([grade(95), grade(75), grade(10)]).toEqual([['A'], ['B'], ['C']]);
  });

  it('records one check per condition tried', () => {
    const frames = run('x = 1\nif x > 5:\n    say "big"\nelse if x > 0:\n    say "small"');
    expect(frames.filter((f) => f.event.type === 'if-check').map((f) => f.line)).toEqual([2, 4]);
  });
});

describe('lists', () => {
  it('reads, writes, measures and grows lists, positions starting at 0', () => {
    const source = `nums = [3, 8, 1]
say nums[0]
nums[1] = 5
add(nums, 9)
say len(nums)
say nums`;
    expect(outputOf(source)).toEqual(['3', '4', '[3, 5, 1, 9]']);
    expect(finalVars(source).nums).toEqual([3, 5, 1, 9]);
  });

  it('highlights the changed position', () => {
    const frame = run('nums = [3, 8]\nnums[1] = 4').at(-2)!;
    expect(frame).toMatchObject({ changed: 'nums', changedIndex: 1 });
    expect(caption(frame, 'en')).toBe('Put 4 in position 1 of nums.');
  });

  it('walks a list with for each', () => {
    const source = 'total = 0\nfor each n in [2, 4, 6]:\n    total = total + n\nsay total';
    expect(outputOf(source)).toEqual(['12']);
    const enters = run(source).filter((f) => f.event.type === 'each-enter');
    expect(caption(enters[1]!, 'en')).toBe('Next item: n is 4 (item 2 of 3).');
    expect(traceRows(run(source), 3, ['n', 'total'])).toEqual([
      ['2', '2'],
      ['4', '6'],
      ['6', '12'],
    ]);
  });

  it('copies lists on assignment', () => {
    expect(outputOf('a = [1, 2]\nb = a\nb[0] = 9\nsay a\nsay b')).toEqual(['[1, 2]', '[9, 2]']);
  });

  it('explains positions that do not exist', () => {
    expect(err('nums = [3, 8, 1]\nsay nums[3]').message).toMatch(/positions 0 to 2/);
    expect(err('nums = []\nsay nums[0]').message).toMatch(/empty/);
    expect(err('x = 5\nadd(x, 1)').message).toMatch(/not a list/);
    expect(err('nums = [1]\nsay nums + 1').message).toMatch(/add\(list, value\)/);
  });

  it('compares lists by value', () => {
    expect(outputOf('say [1, 2] == [1, 2]\nsay [1] != [2]')).toEqual(['true', 'true']);
  });
});

describe('text', () => {
  it('has positions and a length, and loops over letters', () => {
    expect(outputOf('word = "code"\nsay word[0]\nsay len(word)')).toEqual(['c', '4']);
    expect(
      outputOf('n = 0\nfor each ch in "hello":\n    if ch == "l":\n        n = n + 1\nsay n'),
    ).toEqual(['2']);
    expect(outputOf('say "5" + 1')).toEqual(['51']);
  });
});

describe('functions', () => {
  const source = `define double(x):
    y = x * 2
    return y
say double(4)
say double(10)`;

  it('defines, calls with inputs, and returns values', () => {
    expect(outputOf(source)).toEqual(['8', '20']);
  });

  it('gives each call its own boxes on a call stack', () => {
    const frames = run(source);
    expect(caption(frames[1]!, 'en')).toBe(
      'Remember the steps of double for later. Nothing runs yet.',
    );
    const call = frames.find((f) => f.event.type === 'call')!;
    expect(call.stack).toEqual([{ name: 'double', vars: { x: 4 } }]);
    expect(caption(call, 'en')).toBe('Run double with x = 4. It gets its own boxes.');
    const ret = frames.find((f) => f.event.type === 'return')!;
    expect(caption(ret, 'hi-Latn')).toBe(
      'double ne 8 wapas diya. Jahan se bulaya tha wahan wapas jao.',
    );
    // Boxes made inside the function never leak out.
    expect(frames.at(-1)!.vars).toEqual({});
    expect(frames.at(-1)!.stack).toEqual([]);
  });

  it('runs functions without return as statements', () => {
    expect(
      outputOf('define greet(name):\n    say "Hi " + name\ngreet("Riya")\ngreet("Aman")'),
    ).toEqual(['Hi Riya', 'Hi Aman']);
  });

  it('supports recursion with a depth limit', () => {
    expect(
      outputOf(
        'define fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\nsay fact(5)',
      ),
    ).toEqual(['120']);
    expect(err('define loop(n):\n    return loop(n + 1)\nsay loop(1)').message).toMatch(
      /calls inside calls/,
    );
  });

  it('reads top-level boxes but writes its own', () => {
    expect(
      outputOf(
        'rate = 3\ndefine price(n):\n    rate = 10\n    return n * rate\nsay price(2)\nsay rate',
      ),
    ).toEqual(['20', '3']);
  });

  it('reports common mistakes clearly', () => {
    expect(err('say double(2)').message).toMatch(/no function called "double"/);
    expect(err('define f(a):\n    return a\nsay f(1, 2)').message).toMatch(/needs 1 input/);
    expect(err('define f():\n    say 1\nsay f()').message).toMatch(/does not return a value/);
    expect(err('return 5').message).toMatch(/only works inside a function/);
    expect(err('len = 3').message).toMatch(/built-in/);
    expect(err('x = 1\nif x = 1:\n    say x').message).toMatch(/use == to compare/);
  });
});

describe('evaluateExpression', () => {
  it('evaluates truth-table expressions', () => {
    expect(evaluateExpression('a and not b', { a: true, b: false })).toBe(true);
    expect(evaluateExpression('a or b', { a: false, b: false })).toBe(false);
  });
});
