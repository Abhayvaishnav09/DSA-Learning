import type { LocalHandler } from '@logicpath/api-client/local';
import type { platform } from '@logicpath/contracts';
import { addDays, istDate } from '@logicpath/gamification-rules';
import type { AttemptRow, LocalDb } from '../db';
import { simulateDemo } from '../demo';
import { paginate } from '../util';

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Dates from `days - 1` days ago up to today (India time), oldest first. */
function window(now: Date, days: number): string[] {
  const today = istDate(now);
  return Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
}

const countBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
};

/** Per (learner, question): was the very first try right? */
function firstTries(attempts: readonly AttemptRow[]) {
  const first = new Map<string, AttemptRow>();
  for (const row of [...attempts].sort((a, b) => a.at.localeCompare(b.at))) {
    if (row.source === 'predict') continue;
    const key = `${row.userId}:${row.itemId}`;
    if (!first.has(key)) first.set(key, row);
  }
  return [...first.values()];
}

export function analyticsHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'admin.analytics.overview': (ctx, { query }) => {
      simulateDemo(db, ctx.now);
      const days = Number((query as { days?: number }).days ?? 30);
      const dates = window(ctx.now, days);
      const from = dates[0]!;
      const attempts = db.t.attempts.filter((a) => istDate(new Date(a.at)) >= from);
      const perDay = countBy(attempts, (a) => istDate(new Date(a.at)));
      const correctPerDay = countBy(
        attempts.filter((a) => a.correct),
        (a) => istDate(new Date(a.at)),
      );
      const signups = countBy(
        Object.values(db.t.users).filter((u) => u.role === 'student'),
        (u) => istDate(new Date(u.createdAt)),
      );
      const lessons = new Map<string, number>();
      for (const state of Object.values(db.t.learners)) {
        for (const lesson of Object.values(state.lessons)) {
          if (lesson.completedAt) {
            const day = istDate(new Date(lesson.completedAt));
            lessons.set(day, (lessons.get(day) ?? 0) + 1);
          }
        }
      }
      const activeSince = (n: number) =>
        new Set(
          db.t.attempts
            .filter((a) => istDate(new Date(a.at)) >= addDays(istDate(ctx.now), -(n - 1)))
            .map((a) => a.userId),
        ).size;
      const series = (counts: Map<string, number>) =>
        dates.map((date) => ({ date, value: counts.get(date) ?? 0 }));

      const misconceptions = countBy(
        attempts.filter((a) => a.misconception),
        (a) => a.misconception!,
      );
      const tries = firstTries(attempts);
      const byItem = new Map<string, AttemptRow[]>();
      for (const row of tries) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);

      return {
        activeUsers: { day: activeSince(1), week: activeSince(7), month: activeSince(30) },
        signups: series(signups),
        attempts: series(perDay),
        // A day nobody answered anything has no rate; leaving it out beats drawing a fall to 0%.
        correctRate: dates
          .filter((date) => perDay.get(date))
          .map((date) => ({
            date,
            value: round(((correctPerDay.get(date) ?? 0) / perDay.get(date)!) * 100),
          })),
        lessonsCompleted: series(lessons),
        topMisconceptions: [...misconceptions]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, count]) => ({ id, count })),
        hardestItems: [...byItem]
          .filter(([, rows]) => rows.length >= 3)
          .map(([itemId, rows]) => ({
            itemId,
            attempts: rows.length,
            firstTryRate: round(rows.filter((r) => r.correct).length / rows.length, 2),
          }))
          .sort((a, b) => a.firstTryRate - b.firstTryRate)
          .slice(0, 5),
      };
    },

    'studio.analytics.items': (ctx, { query }) => {
      simulateDemo(db, ctx.now);
      const { conceptId } = query as { conceptId?: string };
      const rows = db.t.attempts.filter(
        (a) => a.source !== 'predict' && (!conceptId || a.conceptId === conceptId),
      );
      const byItem = new Map<string, AttemptRow[]>();
      for (const row of rows) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);
      const firstByItem = new Map<string, AttemptRow[]>();
      for (const row of firstTries(rows))
        firstByItem.set(row.itemId, [...(firstByItem.get(row.itemId) ?? []), row]);
      const items: platform.ItemStats['items'] = [...byItem].map(([itemId, all]) => {
        const first = firstByItem.get(itemId) ?? [];
        const top = [
          ...countBy(
            all.filter((r) => r.misconception),
            (r) => r.misconception!,
          ),
        ].sort((a, b) => b[1] - a[1])[0];
        return {
          itemId,
          conceptId: all[0]!.conceptId,
          attempts: all.length,
          firstTryRate: first.length
            ? round(first.filter((r) => r.correct).length / first.length, 2)
            : 0,
          avgHints: round(all.reduce((s, r) => s + r.hintLevel, 0) / all.length, 2),
          avgSeconds: round(all.reduce((s, r) => s + r.durationMs, 0) / all.length / 1000),
          topMisconception: top?.[0] ?? null,
        };
      });
      return { items: items.sort((a, b) => a.firstTryRate - b.firstTryRate) };
    },

    'admin.audit.list': (_ctx, { query }) => {
      const q = query as platform.AuditQuery;
      const rows = db.t.audit.filter(
        (e) =>
          (!q.actorId || e.actorId === q.actorId) &&
          (!q.action || e.action === q.action) &&
          (!q.targetType || e.targetType === q.targetType),
      );
      return paginate(rows, q);
    },
  };
}
