import { describe, expect, it } from 'vitest';
import { bundle as shippedBundle } from '@/shared/content/bundle';
import { describeChange, withChange } from './describe';

const item = shippedBundle.items['loops.counter.fill']!;

describe('describeChange', () => {
  it('describes an upsert by the words a person sees', () => {
    const line = describeChange(
      { kind: 'item', op: 'upsert', id: item.id, data: item },
      'en',
      shippedBundle,
    );
    expect(line).toMatchObject({ kind: 'item', id: item.id, remove: false });
    expect(line.label).toContain('Hello');
    const hi = describeChange(
      { kind: 'item', op: 'upsert', id: item.id, data: item },
      'hi-Latn',
      shippedBundle,
    );
    expect(hi.label).not.toBe(line.label);
  });

  it('names a deletion by what it removes, or by the id when it is unknown', () => {
    expect(
      describeChange({ kind: 'item', op: 'delete', id: item.id }, 'en', shippedBundle),
    ).toMatchObject({
      remove: true,
    });
    expect(
      describeChange({ kind: 'lesson', op: 'delete', id: 'loops.counter' }, 'en', shippedBundle)
        .label,
    ).toBe('The gate counter');
    expect(
      describeChange({ kind: 'concept', op: 'delete', id: 'loops.counter' }, 'en', shippedBundle)
        .label,
    ).toBe('Loops with a counter');
    expect(
      describeChange(
        { kind: 'misconception', op: 'delete', id: 'loop.runs-once' },
        'en',
        shippedBundle,
      ).label,
    ).toContain('once');
    expect(
      describeChange({ kind: 'item', op: 'delete', id: 'nope' }, 'en', shippedBundle).label,
    ).toBe('nope');
  });
});

describe('withChange', () => {
  const a = { kind: 'item', op: 'delete', id: 'a' } as const;
  const b = { kind: 'item', op: 'delete', id: 'b' } as const;
  it('replaces, adds and removes by kind and id', () => {
    expect(
      withChange([a, b], { kind: 'item', op: 'delete', id: 'a' }, { kind: 'item', id: 'a' }),
    ).toEqual([b, a]);
    expect(withChange([a], b, { kind: 'item', id: 'b' })).toEqual([a, b]);
    expect(withChange([a, b], null, { kind: 'item', id: 'a' })).toEqual([b]);
    expect(withChange([a], null, { kind: 'lesson', id: 'a' })).toEqual([a]);
  });
});
