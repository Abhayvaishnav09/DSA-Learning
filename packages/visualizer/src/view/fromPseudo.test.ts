import { describe, expect, it } from 'vitest';
import { boxKey, viewText, type ViewFrame } from './model';
import { viewPseudocode } from './fromPseudo';

const SEARCH = `papers = ["Alice", "Bob", "Cara", "Dev"]
define find(papers, name):
    for each p in papers:
        if p == name:
            return true
    return false
say find(papers, "Cara")`;

/** A box's value as text, in a function call (depth 0..) or at the top level (-1). */
const valueOf = (frame: ViewFrame, depth: number, name: string) => {
  const boxes = depth === -1 ? frame.globals : frame.stack[depth]?.boxes;
  const box = boxes?.find((b) => b.name === name);
  return box ? viewText(box.value) : undefined;
};

describe('viewPseudocode', () => {
  const frames = viewPseudocode(SEARCH);
  const inside = boxKey(0, 'papers');

  it('marks the cell being looked at, the cells already checked and the match', () => {
    const bob = frames.find((f) => f.line === 4 && valueOf(f, 0, 'p') === 'Bob')!;
    expect(bob.marks[inside]).toEqual({
      0: { seen: true },
      1: { state: 'miss', pointers: ['p'] },
    });

    const cara = frames.find((f) => f.line === 4 && valueOf(f, 0, 'p') === 'Cara')!;
    expect(cara.marks[inside]).toEqual({
      0: { seen: true },
      1: { seen: true },
      2: { state: 'found', pointers: ['p'] },
    });
  });

  it('counts comparisons and keeps both languages of narration', () => {
    expect(frames.at(-1)!.checks).toBe(3);
    expect(frames.at(-1)!.output).toEqual(['true']);
    expect(frames[1]!.caption.en).toBe(
      'Make a box called papers and put ["Alice", "Bob", "Cara", "Dev"] in it.',
    );
    expect(frames[1]!.caption['hi-Latn']).toContain('naam ka box banao');
  });

  it('labels index variables on the list they index', () => {
    const view = viewPseudocode('nums = [4, 7, 9]\nfor i from 0 to 2:\n    say nums[i]');
    const second = view.find((f) => f.line === 2 && valueOf(f, -1, 'i') === '1')!;
    expect(second.marks[boxKey(-1, 'nums')]).toEqual({ 1: { pointers: ['i'] } });
  });
});
