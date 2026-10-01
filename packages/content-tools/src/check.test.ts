import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { checkContent } from './check';
import { loadContent } from './load';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const t = (s: string) => `{ en: "${s}", hi-Latn: "${s}" }`;

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'content-'));
  dirs.push(root);
  const defaults: Record<string, string> = {
    'graph.yaml': `stages:\n  - { id: 0, title: ${t('S')} }\nconcepts:\n  - { id: c.one, stage: 0, title: ${t('One')} }\n`,
    'misconceptions.yaml': `misconceptions:\n  - { id: m.one, title: ${t('M')}, explanation: ${t('E')} }\n`,
    'concepts/c.one/lesson.yaml': `concept: c.one
minutes: 5
story: { title: ${t('T')}, body: [${t('B')}], terms: [] }
see: { intro: ${t('I')}, code: "x = 1\\nsay x" }
predict: { intro: ${t('P')}, pauseAt: 1, item: c.one.a }
practice: [c.one.b]
recap: [${t('R')}]
`,
    'concepts/c.one/items/a.yaml': item('c.one.a', '"2"'),
    'concepts/c.one/items/b.yaml': item('c.one.b', '"2"'),
  };
  for (const [path, body] of Object.entries({ ...defaults, ...files })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

function item(id: string, answer: string, extra = '') {
  return `id: ${id}
concept: c.one
type: predict-output
difficulty: 1
prompt: ${t('What is shown?')}
code: "x = 1\\nsay x + 1"
ask: last
answer: ${answer}
hints: [${t('h')}]
explanation: ${t('e')}
estSeconds: 20
${extra}`;
}

function errorsFor(root: string) {
  const { content, issues } = loadContent(root);
  return [...issues, ...(content ? checkContent(content) : [])].filter(
    (i) => i.severity === 'error',
  );
}

describe('content checks', () => {
  it('accepts valid content and builds a stable bundle', () => {
    const root = fixture({});
    expect(errorsFor(root)).toEqual([]);
    const { content } = loadContent(root);
    const bundle = buildBundle(content!);
    expect(bundle.concepts[0]!.published).toBe(true);
    expect(buildBundle(loadContent(root).content!).version).toBe(bundle.version);
  });

  it('catches an answer key that does not match what the program shows', () => {
    const errors = errorsFor(fixture({ 'concepts/c.one/items/b.yaml': item('c.one.b', '"3"') }));
    expect(errors.map((e) => e.message)).toContainEqual(
      expect.stringContaining('the program shows "2"'),
    );
  });

  it('catches a wrong answer that would be graded correct, and unknown misconceptions', () => {
    const errors = errorsFor(
      fixture({
        'concepts/c.one/items/b.yaml': item(
          'c.one.b',
          '"2"',
          'wrongAnswers:\n  - { match: "2.0", misconception: m.nope }\n',
        ),
      }),
    );
    const messages = errors.map((e) => e.message);
    expect(messages).toContainEqual(expect.stringContaining('graded as correct'));
    expect(messages).toContainEqual(expect.stringContaining('unknown misconception m.nope'));
  });

  it('catches prerequisite cycles and missing translations', () => {
    const errors = errorsFor(
      fixture({
        'graph.yaml': `stages:\n  - { id: 0, title: { en: "S" } }\nconcepts:
  - { id: c.one, stage: 0, title: ${t('One')}, prerequisites: [c.two] }
  - { id: c.two, stage: 0, title: ${t('Two')}, prerequisites: [c.one] }\n`,
      }),
    );
    expect(errors.map((e) => e.message).join('\n')).toMatch(/hi-Latn/);

    const cyclic = errorsFor(
      fixture({
        'graph.yaml': `stages:\n  - { id: 0, title: ${t('S')} }\nconcepts:
  - { id: c.one, stage: 0, title: ${t('One')}, prerequisites: [c.two] }
  - { id: c.two, stage: 0, title: ${t('Two')}, prerequisites: [c.one] }\n`,
      }),
    );
    expect(cyclic.map((e) => e.message)).toContainEqual(expect.stringContaining('cycle'));
  });

  it('catches lessons that point at missing items or pause past the end', () => {
    const errors = errorsFor(
      fixture({
        'concepts/c.one/lesson.yaml': `concept: c.one
minutes: 5
story: { title: ${t('T')}, body: [${t('B')}], terms: [] }
see: { intro: ${t('I')}, code: "x = 1" }
predict: { intro: ${t('P')}, pauseAt: 9, item: c.one.a }
practice: [c.one.missing]
recap: [${t('R')}]
`,
      }),
    );
    const messages = errors.map((e) => e.message);
    expect(messages).toContainEqual(expect.stringContaining('pauseAt'));
    expect(messages).toContainEqual(expect.stringContaining('c.one.missing does not exist'));
  });
});
