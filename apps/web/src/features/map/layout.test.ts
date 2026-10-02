import type { BundleConcept, Stage } from '@logicpath/content-schema';
import { describe, expect, it } from 'vitest';
import { layoutMap, pathOrder } from './layout';

const t = (s: string) => ({ en: s, 'hi-Latn': s });
const stages: Stage[] = [0, 1, 2].map((id) => ({ id, title: t(`S${id}`) }));
const concept = (id: string, stage: number, prerequisites: string[] = []): BundleConcept => ({
  id,
  stage,
  title: t(id),
  prerequisites,
  published: true,
});

describe('map layout', () => {
  const concepts = [
    concept('a', 0),
    concept('b', 0, ['a']),
    concept('c', 1, ['b']),
    concept('d', 2, ['c', 'missing']),
  ];
  const layout = layoutMap(stages, concepts);

  it('puts every concept on its stage island, islands rising left to right', () => {
    expect(layout.nodes).toHaveLength(4);
    expect(layout.islands.map((s) => s.center[0])).toEqual(
      [...layout.islands.map((s) => s.center[0])].sort((x, y) => x - y),
    );
    for (const node of layout.nodes) {
      const island = layout.islands.find((s) => s.stageId === node.stageId)!;
      const dx = node.position[0] - island.center[0];
      const dz = node.position[2] - island.center[2];
      expect(Math.hypot(dx, dz)).toBeLessThan(island.radius);
    }
  });

  it('draws a bridge for every known prerequisite, ignoring unknown ones', () => {
    expect(layout.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ]);
  });

  it('is deterministic and walks the path in stage order', () => {
    expect(layoutMap(stages, concepts)).toEqual(layout);
    expect(pathOrder(layout)).toEqual(['a', 'b', 'c', 'd']);
  });
});
