import type { BundleConcept, Stage } from '@logicpath/content-schema';

/**
 * Where everything sits on the learning map, in world units (pure, so the 3D and 2D maps agree
 * and it can be tested). Stages are islands climbing left to right and zig-zagging in depth;
 * each island holds its concepts in a ring; prerequisites are the bridges between them.
 */

export type Vec3 = [number, number, number];

export interface MapIsland {
  stageId: number;
  center: Vec3;
  radius: number;
}

export interface MapNode {
  id: string;
  stageId: number;
  position: Vec3;
}

export interface MapEdge {
  from: string;
  to: string;
}

export interface MapLayout {
  islands: MapIsland[];
  nodes: MapNode[];
  edges: MapEdge[];
  /** x/z bounds, for fitting the camera and the 2D view. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const ISLAND_GAP = 6.5;
const RISE = 0.7;
const ZIGZAG = 2.2;

export function layoutMap(stages: readonly Stage[], concepts: readonly BundleConcept[]): MapLayout {
  const ordered = [...stages].sort((a, b) => a.id - b.id);
  const islands: MapIsland[] = [];
  const nodes: MapNode[] = [];

  ordered.forEach((stage, i) => {
    const members = concepts.filter((c) => c.stage === stage.id);
    const ringRadius = members.length <= 1 ? 0 : Math.max(1.3, members.length * 0.45);
    const center: Vec3 = [
      (i - (ordered.length - 1) / 2) * ISLAND_GAP,
      i * RISE,
      i % 2 === 0 ? ZIGZAG / 2 : -ZIGZAG / 2,
    ];
    islands.push({ stageId: stage.id, center, radius: ringRadius + 1.1 });
    members.forEach((concept, j) => {
      // Start at the front-left and go round, so the first concept of a stage faces the camera.
      const angle = Math.PI * 0.75 + (j / Math.max(1, members.length)) * Math.PI * 2;
      nodes.push({
        id: concept.id,
        stageId: stage.id,
        position: [
          center[0] + Math.cos(angle) * ringRadius,
          center[1] + 0.55,
          center[2] + Math.sin(angle) * ringRadius,
        ],
      });
    });
  });

  const known = new Set(nodes.map((n) => n.id));
  const edges = concepts.flatMap((c) =>
    c.prerequisites
      .filter((p) => known.has(p) && known.has(c.id))
      .map((p) => ({ from: p, to: c.id })),
  );

  const xs = islands.flatMap((s) => [s.center[0] - s.radius, s.center[0] + s.radius]);
  const zs = islands.flatMap((s) => [s.center[2] - s.radius, s.center[2] + s.radius]);
  return {
    islands,
    nodes,
    edges,
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    },
  };
}

/** Path order (by stage, then as listed): arrow keys walk through concepts in this order. */
export function pathOrder(layout: MapLayout): string[] {
  return [...layout.nodes].sort((a, b) => a.stageId - b.stageId).map((n) => n.id);
}
