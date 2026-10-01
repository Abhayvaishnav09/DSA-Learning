import { createHash } from 'node:crypto';
import type { ContentBundle } from '@logicpath/content-schema';
import type { LoadedContent } from './load';

/**
 * Compiles checked content into one bundle. The version is a hash of the content, so the same
 * content always produces the same version and a new version means something changed.
 */
export function buildBundle(content: LoadedContent): ContentBundle {
  const body: Omit<ContentBundle, 'version'> = {
    stages: [...content.graph.stages].sort((a, b) => a.id - b.id),
    concepts: content.graph.concepts.map((c) => ({ ...c, published: content.lessons.has(c.id) })),
    misconceptions: Object.fromEntries(content.misconceptions.map((m) => [m.id, m])),
    lessons: Object.fromEntries([...content.lessons].map(([id, { lesson }]) => [id, lesson])),
    items: Object.fromEntries(content.items.map(({ item }) => [item.id, item])),
  };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { version, ...body };
}
