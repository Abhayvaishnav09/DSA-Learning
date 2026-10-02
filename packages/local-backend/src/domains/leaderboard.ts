import type { LocalHandler } from '@logicpath/api-client/local';
import type { engagement } from '@logicpath/contracts';
import {
  LEAGUE_SIZE,
  addDays,
  istDate,
  moveTier,
  rank,
  startOfIstDay,
  weekStart,
  zoneFor,
  type LeagueTier,
} from '@logicpath/gamification-rules';
import type { LocalDb } from '../db';
import { simulateDemo } from '../demo';
import { iso, me } from '../util';
import { grantBadges, learnerOf, localeOf, notify, say } from './engage';

/** XP earned in the week starting on `monday` (days counted in India time, for everyone). */
function weeklyXp(db: LocalDb, monday: string): Map<string, number> {
  const from = startOfIstDay(monday).toISOString();
  const to = startOfIstDay(addDays(monday, 7)).toISOString();
  const totals = new Map<string, number>();
  for (const row of db.t.xp) {
    if (row.at >= from && row.at < to)
      totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.amount);
  }
  return totals;
}

const students = (db: LocalDb) =>
  Object.values(db.t.users).filter((u) => u.role === 'student' && u.status === 'active');

function tierOf(db: LocalDb, userId: string, since: string): engagement.LeagueTier {
  return (db.t.leagues[userId] ??= { tier: 'bronze', since }).tier;
}

/** Everyone in the same tier, in groups of 30 by who joined first. */
function groupOf(db: LocalDb, userId: string, since: string) {
  const tier = tierOf(db, userId, since);
  const members = students(db)
    .filter((u) => tierOf(db, u.id, since) === tier)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const at = members.findIndex((u) => u.id === userId);
  const start = Math.floor(at / LEAGUE_SIZE) * LEAGUE_SIZE;
  return { tier, members: members.slice(start, start + LEAGUE_SIZE) };
}

/**
 * Closes finished weeks: the most active learners in a group move up, the least active move
 * down. Runs lazily when someone looks, for every week since the last time.
 */
export function settleWeeks(db: LocalDb, now: Date) {
  const current = weekStart(istDate(now));
  const firstXp = db.t.xp.reduce((min, row) => (row.at < min ? row.at : min), iso(now));
  let monday = weekStart(istDate(new Date(firstXp)));
  while (monday < current) {
    if (!db.t.settledWeeks.includes(monday)) settle(db, monday, now);
    monday = addDays(monday, 7);
  }
}

function settle(db: LocalDb, monday: string, now: Date) {
  const xp = weeklyXp(db, monday);
  const byTier = new Map<LeagueTier, string[]>();
  for (const user of students(db)) {
    if ((xp.get(user.id) ?? 0) === 0) continue; // an empty week changes nothing
    const tier = tierOf(db, user.id, monday);
    byTier.set(tier, [...(byTier.get(tier) ?? []), user.id]);
  }
  for (const [tier, ids] of byTier) {
    const ordered = ids.sort((a, b) =>
      db.t.users[a]!.createdAt.localeCompare(db.t.users[b]!.createdAt),
    );
    for (let start = 0; start < ordered.length; start += LEAGUE_SIZE) {
      const group = ordered.slice(start, start + LEAGUE_SIZE);
      const ranked = rank(group.map((userId) => ({ userId, xp: xp.get(userId) ?? 0 })));
      for (const learner of ranked) {
        const zone = zoneFor(learner.rank, ranked.length, tier);
        const next = moveTier(tier, zone);
        (db.t.leagueHistory[learner.userId] ??= []).unshift({
          weekStart: monday,
          tier,
          rank: learner.rank,
          xp: learner.xp,
          result: zone === 'promote' ? 'promoted' : zone === 'demote' ? 'demoted' : 'stayed',
        });
        if (next === tier) continue;
        db.t.leagues[learner.userId] = { tier: next, since: addDays(monday, 7) };
        const locale = localeOf(db, learner.userId);
        notify(
          db,
          learner.userId,
          {
            kind: 'league',
            title:
              zone === 'promote'
                ? say(locale, `Promoted to ${next}!`, `${next} league me promote!`)
                : say(locale, `Moved down to ${next}`, `${next} league me aa gaye`),
            body: say(
              locale,
              `You finished #${learner.rank} last week with ${learner.xp} XP.`,
              `Pichhle hafte tum #${learner.rank} rahe, ${learner.xp} XP ke saath.`,
            ),
            link: '/leaderboard',
          },
          now,
        );
        if (zone === 'promote') {
          const state = learnerOf(db, learner.userId);
          state.stats = { ...state.stats, promotions: state.stats.promotions + 1 };
          grantBadges(db, learner.userId, now);
        }
      }
    }
  }
  db.t.settledWeeks.push(monday);
  db.touch();
}

export function leaderboardHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'leaderboard.league': (ctx) => {
      const user = me(ctx);
      simulateDemo(db, ctx.now);
      settleWeeks(db, ctx.now);
      const monday = weekStart(istDate(ctx.now));
      const { tier, members } = groupOf(db, user.id, monday);
      const xp = weeklyXp(db, monday);
      const ranked = rank(members.map((m) => ({ userId: m.id, xp: xp.get(m.id) ?? 0 })));
      return {
        tier,
        weekStart: monday,
        endsAt: startOfIstDay(addDays(monday, 7)).toISOString(),
        standings: ranked.map((r) => ({
          rank: r.rank,
          userId: r.userId,
          displayName: db.t.users[r.userId]!.name,
          xp: r.xp,
          isMe: r.userId === user.id,
          zone: zoneFor(r.rank, ranked.length, tier),
        })),
      };
    },
    'leaderboard.history': (ctx) => {
      const user = me(ctx);
      settleWeeks(db, ctx.now);
      return { items: (db.t.leagueHistory[user.id] ?? []).slice(0, 12) };
    },
  };
}
