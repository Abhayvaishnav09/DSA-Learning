import type {
  ContentBundle,
  GraphConcept,
  Item,
  Lesson,
  Misconception,
} from '@logicpath/content-schema';
import { buildBundle } from './build';
import { checkContent } from './check';
import type { Issue } from './types';
import type { LoadedContent } from './types';

/** One edit a writer makes to the curriculum (an authoring draft holds a list of these). */
export type ContentChange =
  | { kind: 'concept'; op: 'upsert'; id: string; data: GraphConcept }
  | { kind: 'lesson'; op: 'upsert'; id: string; data: Lesson }
  | { kind: 'item'; op: 'upsert'; id: string; data: Item }
  | { kind: 'misconception'; op: 'upsert'; id: string; data: Misconception }
  | { kind: 'concept' | 'lesson' | 'item' | 'misconception'; op: 'delete'; id: string };

export type ChangeKind = ContentChange['kind'];

/** The file path a piece of content would have in the YAML tree, so issues read the same. */
export function contentPath(kind: ChangeKind, id: string, concept?: string): string {
  switch (kind) {
    case 'concept':
      return 'graph.yaml';
    case 'misconception':
      return 'misconceptions.yaml';
    case 'lesson':
      return `concepts/${id}/lesson.yaml`;
    case 'item':
      return `concepts/${concept ?? '?'}/items/${id.startsWith(`${concept}.`) ? id.slice(concept!.length + 1) : id}.yaml`;
  }
}

/** Turns a published bundle back into the shape the checker reads. */
export function bundleToLoaded(bundle: Omit<ContentBundle, 'version'>): LoadedContent {
  return {
    root: '',
    graph: {
      stages: bundle.stages,
      concepts: bundle.concepts.map(({ published: _published, ...concept }) => concept),
    },
    misconceptions: Object.values(bundle.misconceptions),
    lessons: new Map(
      Object.entries(bundle.lessons).map(([id, lesson]) => [
        id,
        { file: contentPath('lesson', id), lesson },
      ]),
    ),
    items: Object.values(bundle.items).map((item) => ({
      file: contentPath('item', item.id, item.concept),
      dirConcept: item.concept,
      item,
    })),
  };
}

/** Applies changes in order to a copy of the content; the input is not modified. */
export function applyChanges(
  content: LoadedContent,
  changes: readonly ContentChange[],
): LoadedContent {
  const concepts = new Map(content.graph.concepts.map((c) => [c.id, c]));
  const misconceptions = new Map(content.misconceptions.map((m) => [m.id, m]));
  const lessons = new Map(content.lessons);
  const items = new Map(content.items.map((i) => [i.item.id, i]));

  for (const change of changes) {
    if (change.op === 'delete') {
      ({ concept: concepts, misconception: misconceptions, lesson: lessons, item: items })[
        change.kind
      ].delete(change.id);
      continue;
    }
    switch (change.kind) {
      case 'concept':
        concepts.set(change.id, change.data);
        break;
      case 'misconception':
        misconceptions.set(change.id, change.data);
        break;
      case 'lesson':
        lessons.set(change.id, { file: contentPath('lesson', change.id), lesson: change.data });
        break;
      case 'item':
        items.set(change.id, {
          file: contentPath('item', change.id, change.data.concept),
          dirConcept: change.data.concept,
          item: change.data,
        });
        break;
    }
  }

  return {
    root: content.root,
    graph: { stages: content.graph.stages, concepts: [...concepts.values()] },
    misconceptions: [...misconceptions.values()],
    lessons,
    items: [...items.values()],
  };
}

/** Bundle → changes applied → new bundle (without visuals). */
export function applyToBundle(
  bundle: ContentBundle,
  changes: readonly ContentChange[],
): ContentBundle {
  return buildBundle(applyChanges(bundleToLoaded(bundle), changes));
}

/**
 * A writer's changes checked against the live curriculum: every check runs on the result.
 * Errors anywhere block publishing (a change can break something elsewhere); warnings are kept
 * only for what the changes touch, so writers aren't shown other people's warnings.
 */
export function validateChanges(live: ContentBundle, changes: readonly ContentChange[]): Issue[] {
  let next: ContentBundle;
  try {
    next = applyToBundle(live, changes);
  } catch (error) {
    return [
      { file: '-', message: `could not apply the changes: ${String(error)}`, severity: 'error' },
    ];
  }
  const touched = new Set(
    changes.map((c) =>
      contentPath(
        c.kind,
        c.id,
        c.op === 'upsert' && c.kind === 'item' ? c.data.concept : undefined,
      ),
    ),
  );
  return checkContent(bundleToLoaded(next)).filter(
    (issue) => issue.severity === 'error' || touched.has(issue.file),
  );
}
