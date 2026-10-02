import type { ContentBundle } from '@logicpath/content-schema';
import type { platform } from '@logicpath/contracts';

/**
 * Full-text search over the live curriculum: concepts, lessons, questions and misconceptions,
 * in the learner's language. Words are matched by prefix, scored by where they appear.
 * The search service and the in-browser demo run this same code.
 */

interface Doc {
  type: platform.SearchHit['type'];
  id: string;
  conceptId: string;
  title: string;
  /** Searchable text, best-weighted first. */
  fields: { text: string; weight: number }[];
}

const loc = (text: { en: string; 'hi-Latn': string }, locale: 'en' | 'hi-Latn') =>
  text[locale] ?? text.en;

function documents(bundle: ContentBundle, locale: 'en' | 'hi-Latn'): Doc[] {
  const docs: Doc[] = [];
  for (const concept of bundle.concepts.filter((c) => c.published)) {
    const title = loc(concept.title, locale);
    docs.push({
      type: 'concept',
      id: concept.id,
      conceptId: concept.id,
      title,
      fields: [{ text: title, weight: 5 }],
    });
  }
  for (const [conceptId, lesson] of Object.entries(bundle.lessons)) {
    docs.push({
      type: 'lesson',
      id: conceptId,
      conceptId,
      title: loc(lesson.story.title, locale),
      fields: [
        { text: loc(lesson.story.title, locale), weight: 4 },
        { text: lesson.story.body.map((p) => loc(p, locale)).join(' '), weight: 2 },
        { text: lesson.recap.map((p) => loc(p, locale)).join(' '), weight: 1 },
      ],
    });
  }
  for (const item of Object.values(bundle.items)) {
    docs.push({
      type: 'item',
      id: item.id,
      conceptId: item.concept,
      title: loc(item.prompt, locale),
      fields: [
        { text: loc(item.prompt, locale), weight: 3 },
        { text: 'code' in item && typeof item.code === 'string' ? item.code : '', weight: 1 },
      ],
    });
  }
  for (const m of Object.values(bundle.misconceptions)) {
    docs.push({
      type: 'misconception',
      id: m.id,
      conceptId: m.id.split('.').slice(0, 2).join('.'),
      title: loc(m.title, locale),
      fields: [
        { text: loc(m.title, locale), weight: 3 },
        { text: loc(m.explanation, locale), weight: 1 },
      ],
    });
  }
  return docs;
}

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];

function snippetOf(
  text: string,
  terms: string[],
): { snippet: string; highlights: [number, number][] } {
  const clean = text.replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();
  const firstAt = Math.min(
    ...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0),
    clean.length,
  );
  const start = Math.max(0, firstAt - 30);
  const snippet = clean.slice(start, start + 140);
  const highlights: [number, number][] = [];
  const low = snippet.toLowerCase();
  for (const term of terms) {
    let at = low.indexOf(term);
    while (at >= 0) {
      highlights.push([at, at + term.length]);
      at = low.indexOf(term, at + term.length);
    }
  }
  return {
    snippet: (start > 0 ? '…' : '') + snippet,
    highlights: highlights.sort((a, b) => a[0] - b[0]),
  };
}

export interface SearchRequest {
  q: string;
  type?: platform.SearchHit['type'] | undefined;
  locale: 'en' | 'hi-Latn';
  limit: number;
}

export function searchBundle(
  bundle: ContentBundle,
  { q, type, locale, limit }: SearchRequest,
): platform.SearchResults {
  const terms = words(q);
  if (terms.length === 0) return { hits: [], total: 0 };
  const hits: platform.SearchHit[] = [];
  for (const doc of documents(bundle, locale)) {
    if (type && doc.type !== type) continue;
    let score = 0;
    let best: { text: string; weight: number } | null = null;
    let matched = 0;
    for (const term of terms) {
      let termScore = 0;
      for (const field of doc.fields) {
        const tokens = words(field.text);
        const exact = tokens.includes(term) ? 2 : tokens.some((t) => t.startsWith(term)) ? 1 : 0;
        if (exact > 0) {
          termScore = Math.max(termScore, exact * field.weight);
          if (!best || field.weight > best.weight) best = field;
        }
      }
      if (termScore > 0) matched += 1;
      score += termScore;
    }
    if (matched < terms.length || !best) continue; // every word must match somewhere
    const { snippet, highlights } = snippetOf(best.text, terms);
    hits.push({
      type: doc.type,
      id: doc.id,
      conceptId: doc.conceptId,
      title: doc.title,
      snippet,
      highlights,
      score,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { hits: hits.slice(0, limit), total: hits.length };
}
