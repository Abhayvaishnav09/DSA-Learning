/** FNV-1a: a small, stable string hash for seeding. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic display order for `n` things (options, steps), seeded by a stable key so the
 * same learner sees the same order after a refresh. Never returns the authored order for n > 1.
 */
export function displayOrder(key: string, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const next = random(hash(key));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (n > 1 && order.every((value, i) => value === i)) order.push(order.shift()!);
  return order;
}
