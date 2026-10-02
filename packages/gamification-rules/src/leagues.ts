/** Weekly leagues: a small group, one week, the top move up and the bottom move down. */

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];

/** Learners per group. */
export const LEAGUE_SIZE = 30;

export type Zone = 'promote' | 'stay' | 'demote';

/** Up to five move up. Small groups promote a third, so a group of three is not all winners. */
export const promoteCount = (size: number): number => Math.min(5, Math.floor(size / 3));

/** Only full-sized groups demote anyone: a small group is still finding its feet. */
export const demoteCount = (size: number): number =>
  size >= 10 ? Math.min(5, Math.floor(size / 3)) : 0;

export function zoneFor(rank: number, size: number, tier: LeagueTier): Zone {
  if (rank <= promoteCount(size) && tier !== 'diamond') return 'promote';
  if (rank > size - demoteCount(size) && tier !== 'bronze') return 'demote';
  return 'stay';
}

export function moveTier(tier: LeagueTier, zone: Zone): LeagueTier {
  const at = LEAGUE_TIERS.indexOf(tier);
  const next = zone === 'promote' ? at + 1 : zone === 'demote' ? at - 1 : at;
  return LEAGUE_TIERS[Math.max(0, Math.min(LEAGUE_TIERS.length - 1, next))]!;
}

export interface RankedLearner {
  userId: string;
  xp: number;
}

/** XP high to low; ties go to the lower id so every device agrees on the order. */
export function rank<T extends RankedLearner>(learners: readonly T[]): (T & { rank: number })[] {
  return [...learners]
    .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
    .map((learner, index) => ({ ...learner, rank: index + 1 }));
}

/** Monday of the week containing a local date (YYYY-MM-DD). */
export function weekStart(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  return date.toISOString().slice(0, 10);
}

export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Leagues and classes count days and weeks in India time, where the app is first aimed. */
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** The India-time calendar date (YYYY-MM-DD) of a moment. */
export const istDate = (at: Date): string =>
  new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** The moment an India-time calendar day starts. */
export const startOfIstDay = (date: string): Date =>
  new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS);
