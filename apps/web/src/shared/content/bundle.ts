import raw from '@logicpath/content/bundle.json';
import type {
  BundleConcept,
  ContentBundle,
  Item,
  Lesson,
  Locale,
  LocalizedText,
} from '@logicpath/content-schema';
import type { GraphConcept } from '@logicpath/learning-engine';

/** Compiled, validated content (docs/06-content-system.md §4). Built by `pnpm --filter @logicpath/content build`. */
export const bundle = raw as unknown as ContentBundle;

export const text = (value: LocalizedText, locale: Locale): string => value[locale] ?? value.en;

export const concepts: readonly BundleConcept[] = bundle.concepts;

export const conceptGraph: ReadonlyMap<string, GraphConcept> = new Map(
  bundle.concepts.map((c) => [
    c.id,
    { id: c.id, prerequisites: c.prerequisites, published: c.published },
  ]),
);

export function getConcept(id: string): BundleConcept | undefined {
  return bundle.concepts.find((c) => c.id === id);
}

export function getLesson(conceptId: string): Lesson | undefined {
  return bundle.lessons[conceptId];
}

export function getItem(id: string): Item | undefined {
  return bundle.items[id];
}

/** The original item followed by its variations, for reviews. */
export function itemFamily(originalId: string): Item[] {
  const original = bundle.items[originalId];
  if (!original) return [];
  return [original, ...Object.values(bundle.items).filter((i) => i.variationOf === originalId)];
}
