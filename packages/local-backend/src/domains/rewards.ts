import type { LocalHandler } from '@logicpath/api-client/local';
import { BADGES, levelInfo, weekStart } from '@logicpath/gamification-rules';
import { localDate } from '@logicpath/learning-engine';
import type { LocalDb } from '../db';
import { me } from '../util';
import { localeOf, say, totalXp, tzOf, xpSince } from './engage';

const REASONS = {
  attempt: ['Correct answer', 'Sahi jawab'],
  'daily-goal': ['Daily goal reached', 'Daily goal poora'],
  streak: ['Streak bonus', 'Streak bonus'],
  lesson: ['Lesson finished', 'Lesson poora'],
} as const;

export function rewardsHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'rewards.me': (ctx) => {
      const user = me(ctx);
      const xp = totalXp(db, user.id);
      const info = levelInfo(xp);
      const locale = localeOf(db, user.id);
      const week = weekStart(localDate(ctx.now, tzOf(db, user.id)));
      return {
        xp,
        ...info,
        xpThisWeek: xpSince(db, user.id, week),
        badges: db.t.badges[user.id] ?? [],
        recent: db.t.xp
          .filter((row) => row.userId === user.id)
          .slice(-10)
          .reverse()
          .map((row) => {
            const text = REASONS[row.reason as keyof typeof REASONS] ?? [row.reason, row.reason];
            return { amount: row.amount, reason: say(locale, text[0], text[1]), at: row.at };
          }),
      };
    },
    'rewards.badges': () => ({ items: BADGES }),
  };
}
