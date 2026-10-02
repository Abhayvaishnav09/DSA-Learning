import type { LocalHandler } from '@logicpath/api-client/local';
import type { profile } from '@logicpath/contracts';
import type { LocalDb } from '../db';
import { iso, me } from '../util';

export function profileHandlers(db: LocalDb): Record<string, LocalHandler> {
  const ensure = (userId: string, name: string, now: Date): profile.Profile =>
    (db.t.profiles[userId] ??= {
      userId,
      displayName: name,
      locale: 'en',
      timeZone: 'Asia/Kolkata',
      dailyGoalMinutes: 10,
      theme: 'system',
      updatedAt: iso(now),
    });

  return {
    'profile.get': (ctx) => {
      const user = me(ctx);
      return ensure(user.id, user.name, ctx.now);
    },
    'profile.update': (ctx, { body }) => {
      const user = me(ctx);
      const current = ensure(user.id, user.name, ctx.now);
      const next = { ...current, ...(body as Partial<profile.Profile>), updatedAt: iso(ctx.now) };
      db.t.profiles[user.id] = next;
      db.touch();
      return next;
    },
  };
}
