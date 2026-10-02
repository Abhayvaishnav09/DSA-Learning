import type { LocalHandler } from '@logicpath/api-client/local';
import { evaluateAll } from '@logicpath/flags-rules';
import type { LocalDb } from '../db';
import { me } from '../util';
import { learningHandlers } from './learning';
import { leaderboardHandlers } from './leaderboard';
import { notificationHandlers } from './notifications';
import { rewardsHandlers } from './rewards';
import { profileHandlers } from './profile';

/** The dashboard in one call (the gateway composes it from five services in production). */
export function homeHandlers(db: LocalDb): Record<string, LocalHandler> {
  const learning = learningHandlers(db);
  const league = leaderboardHandlers(db);
  const notifications = notificationHandlers(db);
  const profile = profileHandlers(db);
  const rewards = rewardsHandlers(db);

  return {
    home: async (ctx, input) => {
      const user = me(ctx);
      const call = (handler: LocalHandler | undefined) => handler!(ctx, input);
      const list = (await call(notifications['notifications.list'])) as { unreadCount: number };
      return {
        profile: await call(profile['profile.get']),
        progress: await call(learning['progress.get']),
        reviews: await call(learning['reviews.summary']),
        rewards: await call(rewards['rewards.me']),
        league: await call(league['leaderboard.league']),
        unreadNotifications: list.unreadCount,
        flags: {
          flags: evaluateAll(db.t.flags, {
            userId: user.id,
            role: user.role,
            platform: 'web',
            appVersion: null,
          }),
        },
        partial: [],
      };
    },
  };
}
