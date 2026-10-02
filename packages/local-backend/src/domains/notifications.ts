import type { LocalHandler } from '@logicpath/api-client/local';
import type { engagement, ParamsOf } from '@logicpath/contracts';
import { localDate } from '@logicpath/learning-engine';
import { reviewSummary } from '@logicpath/progress-rules';
import type { LocalDb } from '../db';
import { iso, me, notFound, paginate } from '../util';
import { learnerOf, localeOf, notify, say, tzOf } from './engage';

const DEFAULT_PREFS: engagement.NotificationPrefs = {
  reviewReminders: true,
  weeklySummary: true,
  productNews: false,
};

/**
 * Review reminders appear the first time someone opens the inbox on a day when cards are due
 * (a real service sends them by email on a schedule; the demo has no scheduler).
 */
function remindOfReviews(db: LocalDb, userId: string, now: Date) {
  const prefs = db.t.notificationPrefs[userId] ?? DEFAULT_PREFS;
  if (!prefs.reviewReminders) return;
  const tz = tzOf(db, userId);
  const today = localDate(now, tz);
  const already = db.t.notifications.some(
    (n) =>
      n.userId === userId &&
      n.kind === 'review_due' &&
      localDate(new Date(n.createdAt), tz) === today,
  );
  const { dueNow } = reviewSummary(learnerOf(db, userId), now, tz);
  if (already || dueNow === 0) return;
  const locale = localeOf(db, userId);
  notify(
    db,
    userId,
    {
      kind: 'review_due',
      title: say(locale, `${dueNow} to review`, `${dueNow} review baaki`),
      body: say(
        locale,
        'A few minutes now keeps it in your memory.',
        'Abhi kuch minute lagao, yaad rahega.',
      ),
      link: '/review',
    },
    now,
  );
  db.touch();
}

export function notificationHandlers(db: LocalDb): Record<string, LocalHandler> {
  const mine = (userId: string) => db.t.notifications.filter((n) => n.userId === userId);
  const strip = ({ userId: _u, ...note }: LocalDb['t']['notifications'][number]) => note;

  return {
    'notifications.list': (ctx, { query }) => {
      const user = me(ctx);
      remindOfReviews(db, user.id, ctx.now);
      const rows = mine(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(rows, query);
      return {
        items: page.items.map(strip),
        nextCursor: page.nextCursor,
        unreadCount: rows.filter((n) => n.readAt === null).length,
      };
    },
    'notifications.read': (ctx, { params }) => {
      const user = me(ctx);
      const { id } = params as ParamsOf<'notifications.read'>;
      const note = mine(user.id).find((n) => n.id === id);
      if (!note) throw notFound('Notification');
      note.readAt ??= iso(ctx.now);
      db.touch();
      return { ok: true };
    },
    'notifications.readAll': (ctx) => {
      for (const note of mine(me(ctx).id)) note.readAt ??= iso(ctx.now);
      db.touch();
      return { ok: true };
    },
    'notifications.prefs': (ctx) => db.t.notificationPrefs[me(ctx).id] ?? DEFAULT_PREFS,
    'notifications.setPrefs': (ctx, { body }) => {
      db.t.notificationPrefs[me(ctx).id] = body as engagement.NotificationPrefs;
      db.touch();
      return db.t.notificationPrefs[me(ctx).id];
    },
  };
}
