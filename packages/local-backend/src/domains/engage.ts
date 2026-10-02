import { BADGES, levelFor, newBadges } from '@logicpath/gamification-rules';
import { localDate } from '@logicpath/learning-engine';
import { emptyState, type LearnerState, type XpEvent } from '@logicpath/progress-rules';
import type { LocalDb } from '../db';
import { iso, uuid } from '../util';

/** Small shared helpers: a learner's state, XP, notifications and badges (what keeps people coming back). */

type Locale = 'en' | 'hi-Latn';

export const learnerOf = (db: LocalDb, userId: string): LearnerState =>
  (db.t.learners[userId] ??= emptyState());

export const tzOf = (db: LocalDb, userId: string): string =>
  db.t.profiles[userId]?.timeZone ?? 'Asia/Kolkata';
export const goalOf = (db: LocalDb, userId: string): number =>
  db.t.profiles[userId]?.dailyGoalMinutes ?? 10;
export const localeOf = (db: LocalDb, userId: string): Locale =>
  db.t.profiles[userId]?.locale ?? 'en';

export const say = (locale: Locale, en: string, hi: string) => (locale === 'en' ? en : hi);

export const totalXp = (db: LocalDb, userId: string): number =>
  db.t.xp.reduce((sum, row) => (row.userId === userId ? sum + row.amount : sum), 0);

/** XP earned from a local date (inclusive) on, in the learner's own time zone. */
export function xpSince(db: LocalDb, userId: string, fromDate: string): number {
  const tz = tzOf(db, userId);
  return db.t.xp.reduce(
    (sum, row) =>
      row.userId === userId && localDate(new Date(row.at), tz) >= fromDate ? sum + row.amount : sum,
    0,
  );
}

export function notify(
  db: LocalDb,
  userId: string,
  note: {
    kind: NonNullable<LocalDb['t']['notifications'][number]['kind']>;
    title: string;
    body: string;
    link?: string;
  },
  now: Date,
) {
  db.t.notifications.unshift({
    id: uuid(),
    userId,
    kind: note.kind,
    title: note.title,
    body: note.body,
    link: note.link ?? null,
    readAt: null,
    createdAt: iso(now),
  });
  // The inbox is small on purpose: the browser has little storage.
  const mine = db.t.notifications.filter((n) => n.userId === userId);
  if (mine.length > 100) {
    const drop = new Set(mine.slice(100).map((n) => n.id));
    db.t.notifications = db.t.notifications.filter((n) => !drop.has(n.id));
  }
}

/** Pays XP, then announces level-ups and any badge the learner's numbers now qualify for. */
export function awardXp(db: LocalDb, userId: string, events: readonly XpEvent[], now: Date) {
  const paid = events.filter((e) => e.amount > 0);
  const before = totalXp(db, userId);
  for (const event of paid) {
    db.t.xp.push({ userId, amount: event.amount, reason: event.reason, at: iso(now) });
  }
  const after = before + paid.reduce((sum, e) => sum + e.amount, 0);
  const locale = localeOf(db, userId);
  if (levelFor(after) > levelFor(before)) {
    const level = levelFor(after);
    notify(
      db,
      userId,
      {
        kind: 'level_up',
        title: say(locale, `Level ${level}!`, `Level ${level}!`),
        body: say(
          locale,
          `You reached level ${level}. Keep going!`,
          `Tum level ${level} par pahunch gaye. Aise hi chalte raho!`,
        ),
        link: '/profile',
      },
      now,
    );
  }
  grantBadges(db, userId, now);
}

export function grantBadges(db: LocalDb, userId: string, now: Date) {
  const owned = db.t.badges[userId] ?? [];
  const earned = newBadges(learnerOf(db, userId).stats, new Set(owned.map((b) => b.id)));
  if (earned.length === 0) return;
  db.t.badges[userId] = [...owned, ...earned.map((id) => ({ id, earnedAt: iso(now) }))];
  const locale = localeOf(db, userId);
  for (const id of earned) {
    const badge = BADGES.find((b) => b.id === id)!;
    notify(
      db,
      userId,
      {
        kind: 'badge',
        title: say(locale, `New badge: ${badge.title.en}`, `Naya badge: ${badge.title['hi-Latn']}`),
        body: badge.description[locale],
        link: '/profile',
      },
      now,
    );
  }
}
