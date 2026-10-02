/**
 * Feature flags and remote config: who sees what (docs/04-backend.md, flags service).
 * Pure and deterministic, so the web app, the Flutter app (a Dart port with the same test
 * vectors) and the service all give the same answer for the same person.
 */

export type Role = 'student' | 'writer' | 'admin';
export type Platform = 'web' | 'android';

export interface FlagDef {
  key: string;
  enabled: boolean;
  /** 0–100: the share of people who get the flag. */
  rolloutPercent: number;
  /** Empty means everyone. */
  roles: readonly Role[];
  /** Empty means every platform. */
  platforms: readonly Platform[];
  minAppVersion: string | null;
  value: unknown;
}

export interface FlagContext {
  /** Stable id for the rollout bucket; signed-out visitors have none. */
  userId: string | null;
  role: Role | null;
  platform: Platform;
  appVersion: string | null;
}

/** FNV-1a: tiny, fast and identical in every language. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 0–99. The flag key is part of the hash, so each flag rolls out to a different slice of people. */
export const bucket = (key: string, userId: string): number => hash32(`${key}:${userId}`) % 100;

/** Compares dotted numeric versions: negative, 0 or positive. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const right = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isOn(flag: FlagDef, ctx: FlagContext): boolean {
  if (!flag.enabled) return false;
  if (flag.roles.length > 0 && (ctx.role === null || !flag.roles.includes(ctx.role))) return false;
  if (flag.platforms.length > 0 && !flag.platforms.includes(ctx.platform)) return false;
  if (flag.minAppVersion !== null) {
    if (ctx.appVersion === null || compareVersions(ctx.appVersion, flag.minAppVersion) < 0) {
      return false;
    }
  }
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0 || ctx.userId === null) return false;
  return bucket(flag.key, ctx.userId) < flag.rolloutPercent;
}

export interface Evaluated {
  on: boolean;
  value: unknown;
}

/** Every flag for one person: `value` is only revealed when the flag is on. */
export function evaluateAll(
  flags: readonly FlagDef[],
  ctx: FlagContext,
): Record<string, Evaluated> {
  return Object.fromEntries(
    flags.map((flag) => {
      const on = isOn(flag, ctx);
      return [flag.key, { on, value: on ? flag.value : null }];
    }),
  );
}
