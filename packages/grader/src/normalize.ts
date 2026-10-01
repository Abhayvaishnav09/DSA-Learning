/** Lenient comparison for typed answers: case, spacing, quotes and number formatting don't matter. */
export function normalize(text: string): string {
  let s = text.trim().replace(/\s+/g, ' ').toLowerCase();
  if (s.length >= 2 && /^(["']).*\1$/.test(s)) s = s.slice(1, -1).trim();
  return s;
}

export function sameAnswer(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return true;
  const nx = Number(x);
  const ny = Number(y);
  return x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny) && nx === ny;
}

/** Splits "1, 2, 3" or "1 2 3" or one value per line into values. */
export function tokens(text: string): string[] {
  return normalize(text.replace(/[\n,]/g, ' '))
    .split(' ')
    .filter((t) => t !== '');
}

export function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => sameAnswer(value, b[i]!));
}
