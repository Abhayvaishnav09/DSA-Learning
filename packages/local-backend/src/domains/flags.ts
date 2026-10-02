import type { LocalHandler } from '@logicpath/api-client/local';
import type { ParamsOf, platform } from '@logicpath/contracts';
import { evaluateAll } from '@logicpath/flags-rules';
import type { LocalDb } from '../db';
import { audit, iso, me, notFound } from '../util';

/** Flags every installation starts with (the real service seeds the same list). */
export const DEFAULT_FLAGS: Omit<platform.Flag, 'updatedAt'>[] = [
  {
    key: 'map.3d',
    description: 'Show the 3D learning map (devices that cannot draw it get the flat map anyway).',
    enabled: true,
    rolloutPercent: 100,
    roles: [],
    platforms: [],
    minAppVersion: null,
    value: null,
  },
  {
    key: 'lesson.celebrations',
    description: 'Burst animation after a right answer.',
    enabled: true,
    rolloutPercent: 100,
    roles: [],
    platforms: [],
    minAppVersion: null,
    value: null,
  },
  {
    key: 'config.daily-goal-options',
    description: 'Daily goal choices offered in Settings (minutes).',
    enabled: true,
    rolloutPercent: 100,
    roles: [],
    platforms: [],
    minAppVersion: null,
    value: [5, 10, 15, 20, 30],
  },
  {
    key: 'studio.media',
    description: 'Image library in the studio.',
    enabled: true,
    rolloutPercent: 100,
    roles: ['writer', 'admin'],
    platforms: [],
    minAppVersion: null,
    value: null,
  },
  {
    key: 'beta.review-nudges',
    description: 'Try-out: gentle nudges when reviews are waiting. Rolling out slowly.',
    enabled: true,
    rolloutPercent: 30,
    roles: ['student'],
    platforms: [],
    minAppVersion: null,
    value: null,
  },
];

export function seedFlags(db: LocalDb, now: Date) {
  if (db.t.flags.length > 0) return;
  db.t.flags = DEFAULT_FLAGS.map((flag) => ({ ...flag, updatedAt: iso(now) }));
  db.touch();
}

export function flagsHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'flags.evaluate': (ctx, { query }) => {
      const { platform: platformName, appVersion } = query as platform.FlagsQuery;
      return {
        flags: evaluateAll(db.t.flags, {
          userId: ctx.user?.id ?? null,
          role: ctx.user?.role ?? null,
          platform: platformName,
          appVersion: appVersion ?? null,
        }),
      };
    },
    'admin.flags.list': () => ({
      items: [...db.t.flags].sort((a, b) => a.key.localeCompare(b.key)),
    }),
    'admin.flags.put': (ctx, { params, body }) => {
      const admin = me(ctx);
      const { key } = params as ParamsOf<'admin.flags.put'>;
      if (!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/.test(key)) {
        throw notFound('A flag with a valid key');
      }
      const change = body as platform.FlagChange;
      const existing = db.t.flags.findIndex((f) => f.key === key);
      const next: platform.Flag = { ...change, key, updatedAt: iso(ctx.now) };
      if (existing >= 0) db.t.flags[existing] = next;
      else db.t.flags.push(next);
      audit(
        db,
        admin,
        existing >= 0 ? 'flag.updated' : 'flag.created',
        'flag',
        key,
        { enabled: next.enabled, rolloutPercent: next.rolloutPercent },
        ctx.now,
      );
      db.touch();
      return next;
    },
    'admin.flags.delete': (ctx, { params }) => {
      const { key } = params as ParamsOf<'admin.flags.delete'>;
      if (!db.t.flags.some((f) => f.key === key)) throw notFound('Flag');
      db.t.flags = db.t.flags.filter((f) => f.key !== key);
      audit(db, me(ctx), 'flag.deleted', 'flag', key, {}, ctx.now);
      db.touch();
      return { ok: true };
    },
  };
}
