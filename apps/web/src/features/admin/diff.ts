/** A readable difference between two versions of a piece of content, one changed value per row. */
export interface DiffRow {
  path: string;
  before: string | null;
  after: string | null;
}

function flatten(value: unknown, path: string, into: Map<string, string>) {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) into.set(path, Array.isArray(value) ? '[]' : '{}');
    for (const [key, child] of entries) flatten(child, path ? `${path}.${key}` : key, into);
    return;
  }
  into.set(path, typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * Compares two values by walking every field. A field that only one side has shows as added or
 * removed. Order of the rows follows the new version, then fields only the old one had.
 */
export function diffValues(before: unknown, after: unknown): DiffRow[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  if (before !== undefined) flatten(before, '', a);
  if (after !== undefined) flatten(after, '', b);
  const rows: DiffRow[] = [];
  for (const [path, value] of b) {
    const old = a.get(path);
    if (old !== value) rows.push({ path, before: old ?? null, after: value });
  }
  for (const [path, value] of a) if (!b.has(path)) rows.push({ path, before: value, after: null });
  return rows;
}
