import type { ContentBundle, Locale } from '@logicpath/content-schema';
import type { content } from '@logicpath/contracts';

/** A one-line description of a proposed change, for lists (the question's words, the lesson's title). */
export function describeChange(
  change: content.ContentChange,
  locale: Locale,
  bundle: ContentBundle,
): { kind: content.ContentChange['kind']; id: string; label: string; remove: boolean } {
  const pick = (text: { en: string; 'hi-Latn': string }) => text[locale] || text.en;
  if (change.op === 'delete') {
    const label =
      change.kind === 'item'
        ? bundle.items[change.id] && pick(bundle.items[change.id]!.prompt)
        : change.kind === 'lesson'
          ? bundle.lessons[change.id] && pick(bundle.lessons[change.id]!.story.title)
          : change.kind === 'concept'
            ? bundle.concepts.find((c) => c.id === change.id) &&
              pick(bundle.concepts.find((c) => c.id === change.id)!.title)
            : bundle.misconceptions[change.id] && pick(bundle.misconceptions[change.id]!.title);
    return { kind: change.kind, id: change.id, label: label || change.id, remove: true };
  }
  const label =
    change.kind === 'item'
      ? pick(change.data.prompt)
      : change.kind === 'lesson'
        ? pick(change.data.story.title)
        : pick(change.data.title);
  return { kind: change.kind, id: change.id, label: label || change.id, remove: false };
}

/** The draft's changes with one (kind + id) replaced, added or removed. */
export function withChange(
  changes: readonly content.ContentChange[],
  next: content.ContentChange | null,
  target: { kind: content.ContentChange['kind']; id: string },
): content.ContentChange[] {
  const rest = changes.filter((c) => !(c.kind === target.kind && c.id === target.id));
  return next ? [...rest, next] : rest;
}
