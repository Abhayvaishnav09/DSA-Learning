import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchRoute, ROUTE_TABLE } from './table';

const APP = fileURLToPath(new URL('../../app', import.meta.url));

/** Every page.tsx under src/app as [pattern, shell from its route group]. */
function pages(dir = APP): [string, string][] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    if (name !== 'page.tsx') return [];
    const segments = relative(APP, dir).split(sep).filter(Boolean);
    const group = segments.find((s) => s.startsWith('('))?.slice(1, -1) ?? segments[0]!;
    const pattern =
      '/' +
      segments
        .filter((s) => !s.startsWith('('))
        .map((s) => s.replace(/^\[(.+)\]$/, ':$1'))
        .join('/');
    return [[pattern, group] as [string, string]];
  });
}

describe('route table', () => {
  it('has exactly one Next.js page per row, in the matching route group', () => {
    const fromApp = pages()
      .map(([p, g]) => `${p} ${g}`)
      .sort();
    const fromTable = ROUTE_TABLE.map((r) => `${r.pattern} ${r.shell}`).sort();
    expect(fromApp).toEqual(fromTable);
  });

  it('matches paths, preferring static segments over parameters', () => {
    expect(matchRoute('/studio/drafts/new')?.row.pattern).toBe('/studio/drafts/new');
    expect(matchRoute('/studio/drafts/abc')).toMatchObject({
      row: { pattern: '/studio/drafts/:id' },
      params: { id: 'abc' },
    });
    expect(matchRoute('/learn/loops.counter/')?.params).toEqual({ concept: 'loops.counter' });
    expect(matchRoute('/')?.row.shell).toBe('marketing');
    expect(matchRoute('/nope')).toBeNull();
  });
});
