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

/** The curriculum that ships with the app (docs/06-content-system.md §4). Built by `pnpm --filter @logicpath/content build`. */
const shippedBundle = raw as unknown as ContentBundle;

/**
 * The curriculum in use. It starts as the shipped one; when writers publish something new, the
 * app downloads it and swaps it in here (see live.ts). The bindings below are live, so every
 * import sees the newest content.
 */
export let bundle: ContentBundle = shippedBundle;

export const text = (value: LocalizedText, locale: Locale): string => value[locale] ?? value.en;

export let concepts: readonly BundleConcept[] = bundle.concepts;

const graphOf = (b: ContentBundle): Map<string, GraphConcept> =>
  new Map(
    b.concepts.map((c) => [
      c.id,
      { id: c.id, prerequisites: c.prerequisites, published: c.published },
    ]),
  );

export let conceptGraph: ReadonlyMap<string, GraphConcept> = graphOf(bundle);

export function setBundle(next: ContentBundle) {
  bundle = next;
  concepts = next.concepts;
  conceptGraph = graphOf(next);
}

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
