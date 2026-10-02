import type { ItemOf, LocalizedText } from '@logicpath/content-schema';
import { describe, expect, it } from 'vitest';
import { buildBundle, contentHash, lessonVisual } from './build';
import { applyChanges, applyToBundle, bundleToLoaded } from './changes';
import { checkContent } from './check';
import type { LoadedContent } from './types';

const t = (s: string): LocalizedText => ({ en: s, 'hi-Latn': s });

const predict = (id: string): ItemOf<'predict-output'> => ({
  id,
  concept: 'c.one',
  type: 'predict-output',
  difficulty: 1,
  prompt: t('What is shown?'),
  code: 'x = 1\nsay x + 1',
  ask: 'last',
  answer: '2',
  wrongAnswers: [],
  hints: [t('h')],
  explanation: t('e'),
  estSeconds: 20,
});

function base(): LoadedContent {
  return {
    root: '',
    graph: {
      stages: [{ id: 0, title: t('S') }],
      concepts: [{ id: 'c.one', stage: 0, title: t('One'), prerequisites: [] }],
    },
    misconceptions: [{ id: 'm.one', title: t('M'), explanation: t('E') }],
    lessons: new Map([
      [
        'c.one',
        {
          file: 'concepts/c.one/lesson.yaml',
          lesson: {
            concept: 'c.one',
            minutes: 5,
            story: { title: t('T'), body: [t('B')], terms: [] },
            see: { intro: t('I'), code: 'x = 1\nsay x', captions: { '1': t('Custom') } },
            predict: { intro: t('P'), pauseAt: 1, item: 'c.one.a' },
            practice: ['c.one.b'],
            recap: [t('R')],
          },
        },
      ],
    ]),
    items: ['c.one.a', 'c.one.b'].map((id) => ({
      file: `concepts/c.one/items/${id}.yaml`,
      dirConcept: 'c.one',
      item: predict(id),
    })),
  };
}

const errors = (content: LoadedContent) =>
  checkContent(content).filter((i) => i.severity === 'error');

describe('content changes', () => {
  it('round-trips a bundle and keeps the version stable', () => {
    const bundle = buildBundle(base());
    expect(bundle.version).toMatch(/^[0-9a-f]{12}$/);
    expect(buildBundle(bundleToLoaded(bundle)).version).toBe(bundle.version);
    expect(errors(bundleToLoaded(bundle))).toEqual([]);
  });

  it('applies upserts and deletes without touching the input', () => {
    const content = base();
    const next = applyChanges(content, [
      {
        kind: 'item',
        op: 'upsert',
        id: 'c.one.c',
        data: { ...predict('c.one.c'), variationOf: 'c.one.b' },
      },
      { kind: 'misconception', op: 'delete', id: 'm.one' },
    ]);
    expect(next.items.map((i) => i.item.id)).toEqual(['c.one.a', 'c.one.b', 'c.one.c']);
    expect(next.misconceptions).toEqual([]);
    expect(content.items).toHaveLength(2);
    expect(errors(next)).toEqual([]);
  });

  it('a change that breaks the curriculum is caught by the checker', () => {
    const bundle = buildBundle(base());
    const broken = applyToBundle(bundle, [
      { kind: 'item', op: 'upsert', id: 'c.one.b', data: { ...predict('c.one.b'), answer: '3' } },
    ]);
    expect(broken.version).not.toBe(bundle.version);
    expect(errors(bundleToLoaded(broken)).map((e) => e.message)).toContain(
      'answer is "3" but the program shows "2"',
    );
  });

  it('precomputes visuals with author captions first', () => {
    const visual = lessonVisual(base().lessons.get('c.one')!.lesson);
    expect(visual.frames).toHaveLength(4);
    expect(visual.captions.en[1]).toBe('Custom');
    expect(visual.captions['hi-Latn'][2]).toMatch(/1/);
  });

  it('hashes deterministically', () => {
    expect(contentHash({ a: 1 })).toBe(contentHash({ a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});
