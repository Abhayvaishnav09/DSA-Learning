import { describe, expect, it } from 'vitest';
import { LOCALES, caption } from './captions';
import { PseudoError, parseProgram } from './parse';
import { MAX_STEPS, StepLimitError, outputOf, run, traceRows } from './run';

const COUNTER = `count = 0
for i from 1 to 3:
    count = count + 1
    say i
say "done"`;

describe('run', () => {
  it('runs a counter loop and records every step', () => {
    const frames = run(COUNTER);
    expect(frames.map((f) => f.event.type)).toEqual([
      'start',
      'assign',
      'loop-enter',
      'assign',
      'say',
      'loop-enter',
      'assign',
      'say',
      'loop-enter',
      'assign',
      'say',
      'loop-exit',
      'say',
      'end',
    ]);
    expect(frames.at(-1)!.output).toEqual(['1', '2', '3', 'done']);
    expect(frames.at(-1)!.vars).toEqual({ count: 3, i: 3 });
  });

  it('shows the arithmetic with current values', () => {
    const frame = run(COUNTER)[3]!;
    expect(frame.event).toMatchObject({
      type: 'assign',
      name: 'count',
      work: '0 + 1',
      value: 1,
      previous: 0,
    });
    expect(frame.changed).toBe('count');
    expect(frame.line).toBe(3);
  });

  it('frames are snapshots, not shared references', () => {
    const frames = run(COUNTER);
    expect(frames[1]!.vars).toEqual({ count: 0 });
    expect(frames[4]!.output).toEqual(['1']);
  });

  it('skips a loop whose start is past its end', () => {
    expect(outputOf('for i from 5 to 1:\n    say i\nsay "after"')).toEqual(['after']);
  });

  it('supports if/else, while, text and boolean logic', () => {
    const source = `n = 3
while n > 0:
    if n % 2 == 0 and not false:
        say "even " + n
    else:
        say "odd " + n
    n = n - 1`;
    expect(outputOf(source)).toEqual(['odd 3', 'even 2', 'odd 1']);
  });

  it('respects operator precedence and parentheses', () => {
    expect(outputOf('say 2 + 3 * 4\nsay (2 + 3) * 4\nsay -2 + 5')).toEqual(['14', '20', '3']);
  });

  it('stops infinite loops with a friendly error', () => {
    expect(() => run('x = 1\nwhile x > 0:\n    x = x + 1')).toThrow(StepLimitError);
    expect(MAX_STEPS).toBeGreaterThan(100);
  });

  it('reports mistakes with their line number', () => {
    const cases: [string, number, RegExp][] = [
      ['say total', 1, /no value yet/],
      ['x = 1\nfor i from 1 to 3:\nsay i', 2, /indented/],
      ['x = 1\n    y = 2', 2, /indented too far/],
      ['else:', 1, /must follow/],
      ['say "hi', 1, /closing/],
      ['x = 1 / 0', 1, /divide by 0/],
      ['x = 1 +', 1, /ends too early/],
    ];
    for (const [source, line, message] of cases) {
      try {
        run(source);
        expect.unreachable(source);
      } catch (error) {
        expect(error).toBeInstanceOf(PseudoError);
        expect((error as PseudoError).line).toBe(line);
        expect((error as PseudoError).message).toMatch(message);
      }
    }
  });

  it('ignores comments and blank lines', () => {
    expect(parseProgram('# setup\n\nx = 1  # one\nsay "a # b"')).toHaveLength(2);
    expect(outputOf('say "a # b"')).toEqual(['a # b']);
  });
});

describe('traceRows', () => {
  it('records the columns each time a line finishes', () => {
    expect(traceRows(run(COUNTER), 3, ['i', 'count'])).toEqual([
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
    ]);
  });

  it('uses the loop header line for one row per pass', () => {
    expect(traceRows(run(COUNTER), 2, ['i', 'count'])).toEqual([
      ['1', '0'],
      ['2', '1'],
      ['3', '2'],
    ]);
  });
});

describe('caption', () => {
  it('narrates every step in every locale', () => {
    for (const locale of LOCALES) {
      for (const frame of run(COUNTER)) {
        expect(caption(frame, locale).length).toBeGreaterThan(5);
      }
    }
  });

  it('explains arithmetic in plain words', () => {
    expect(caption(run(COUNTER)[3]!, 'en')).toBe('Work out 0 + 1 = 1. Now count holds 1.');
    expect(caption(run(COUNTER)[11]!, 'en')).toBe(
      'i would be 4, which is more than 3. The loop stops.',
    );
  });
});
