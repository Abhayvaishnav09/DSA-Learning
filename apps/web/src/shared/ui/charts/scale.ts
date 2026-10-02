/** Small, pure helpers for the charts (axis ticks, compact numbers, picking labels). */

/** 1, 2, 2.5, 5 or 10 times a power of ten: the step sizes people read easily. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * Round axis ticks from zero up past `max` (0, 1,000, 2,000), about `target` of them.
 * Counts of whole things (learners, answers) only get whole-number ticks.
 */
export function niceTicks(max: number, target = 4, whole = false): number[] {
  if (!(max > 0)) return [0, 1];
  const step = whole ? Math.max(1, Math.ceil(niceStep(max / target))) : niceStep(max / target);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 1000; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

/** 1,284 · 12.9K · 4.2M: short enough for an axis or a stat tile. */
export function compact(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Indexes of the labels to show on an axis of `count` items, evenly spread, never crowded. */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil((count - 1) / (maxLabels - 1));
  const indexes: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) indexes.unshift(i);
  return indexes;
}

/** The index of the nearest point to a pointer position, for a crosshair that snaps. */
export function nearestIndex(x: number, left: number, right: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(right, Math.max(left, x));
  return Math.round(((clamped - left) / (right - left)) * (count - 1));
}

/** A column with a rounded top and a square bottom (the bar grows from the baseline). */
export function columnPath(
  x: number,
  width: number,
  baseline: number,
  top: number,
  radius = 4,
): string {
  const height = baseline - top;
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  return [
    `M${x},${baseline}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}

/** The same for a bar growing to the right. */
export function barPath(left: number, y: number, height: number, end: number, radius = 4): string {
  const length = end - left;
  if (length <= 0) return '';
  const r = Math.min(radius, height / 2, length);
  return [
    `M${left},${y}`,
    `H${end - r}`,
    `Q${end},${y} ${end},${y + r}`,
    `V${y + height - r}`,
    `Q${end},${y + height} ${end - r},${y + height}`,
    `H${left}`,
    'Z',
  ].join(' ');
}
