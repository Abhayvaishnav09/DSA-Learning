import bundleJson from '@logicpath/content/bundle.json';
import type { ContentBundle } from '@logicpath/content-schema';
import { describe, expect, it } from 'vitest';
import { searchBundle } from './index';

const bundle = bundleJson as unknown as ContentBundle;
const ask = (q: string, extra: Partial<Parameters<typeof searchBundle>[1]> = {}) =>
  searchBundle(bundle, { q, locale: 'en', limit: 20, ...extra });

describe('searchBundle', () => {
  it('finds a lesson by a word in its title and ranks title matches first', () => {
    const { hits, total } = ask('counter');
    expect(total).toBeGreaterThan(0);
    expect(hits[0]!.conceptId).toBe('loops.counter');
    expect(hits.every((h) => h.score > 0)).toBe(true);
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('matches the start of a word, and needs every word to match', () => {
    expect(ask('coun').total).toBeGreaterThan(0);
    expect(ask('counter zzzzqq').total).toBe(0);
    expect(ask('   ').hits).toEqual([]);
    expect(ask('!!!').total).toBe(0);
  });

  it('narrows to one kind of result and respects the limit', () => {
    const items = ask('program', { type: 'item' });
    expect(items.hits.length).toBeGreaterThan(0);
    expect(items.hits.every((h) => h.type === 'item')).toBe(true);
    expect(ask('program', { limit: 1 }).hits).toHaveLength(1);
    expect(ask('program', { limit: 1 }).total).toBeGreaterThan(1);
  });

  it('searches in the learner’s language', () => {
    const hinglish = ask('gate', { locale: 'hi-Latn' });
    expect(hinglish.hits.some((h) => h.title.toLowerCase().includes('gate'))).toBe(true);
    expect(hinglish.hits[0]!.title).not.toBe(ask('gate').hits[0]?.title);
  });

  it('shows where the words matched', () => {
    const { hits } = ask('counter');
    const hit = hits.find((h) => h.highlights.length > 0)!;
    const [from, to] = hit.highlights[0]!;
    expect(hit.snippet.slice(from, to).toLowerCase()).toContain('count');
    expect(hit.snippet.length).toBeLessThanOrEqual(142);
  });

  it('indexes concepts, lessons, questions and misconceptions', () => {
    const kinds = new Set(ask('a', { limit: 50 }).hits.map((h) => h.type));
    expect(kinds.has('concept') || kinds.has('lesson')).toBe(true);
    const mistakes = ask('thinking', { type: 'misconception', limit: 50 });
    expect(mistakes.total).toBeGreaterThan(0);
    expect(mistakes.hits.every((h) => h.type === 'misconception')).toBe(true);
  });

  it('only searches published concepts', () => {
    const unpublished = bundle.concepts.find((c) => !c.published)!;
    const hits = ask(unpublished.title.en.split(' ')[0]!, { type: 'concept', limit: 50 }).hits;
    expect(hits.some((h) => h.id === unpublished.id)).toBe(false);
  });
});
