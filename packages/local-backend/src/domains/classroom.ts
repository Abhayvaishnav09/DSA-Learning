import type { LocalHandler } from '@logicpath/api-client/local';
import type { engagement, ParamsOf } from '@logicpath/contracts';
import { addDays, weekStart } from '@logicpath/gamification-rules';
import type { ClassRow, LocalDb } from '../db';
import { istDate, simulateDemo } from '../demo';
import { audit, conflict, iso, me, notFound, paginate, uuid } from '../util';
import { grantBadges, learnerOf, localeOf, notify, say } from './engage';

/** No 0/O or 1/I: codes get read aloud and typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCode(db: LocalDb): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.t.classes.some((c) => c.code === code)) return code;
  }
}

export function classroomHandlers(db: LocalDb): Record<string, LocalHandler> {
  const summary = (row: ClassRow, showCode: boolean): engagement.ClassSummary => ({
    id: row.id,
    name: row.name,
    code: showCode ? row.code : null,
    ownerId: row.ownerId,
    ownerName: db.t.users[row.ownerId]?.name ?? 'Unknown',
    memberCount: db.t.members.filter((m) => m.classId === row.id).length,
    createdAt: row.createdAt,
  });

  const load = (id: string) => {
    const row = db.t.classes.find((c) => c.id === id);
    if (!row) throw notFound('Class');
    return row;
  };

  return {
    'classes.mine': (ctx) => {
      const user = me(ctx);
      const mine = db.t.classes.filter(
        (c) =>
          c.ownerId === user.id ||
          db.t.members.some((m) => m.classId === c.id && m.userId === user.id),
      );
      return {
        items: mine
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((c) => summary(c, c.ownerId === user.id || user.role === 'admin')),
      };
    },

    'classes.join': (ctx, { body }) => {
      const user = me(ctx);
      const { code } = body as engagement.JoinClass;
      const row = db.t.classes.find((c) => c.code === code);
      if (!row) throw notFound('A class with that code');
      if (row.ownerId === user.id) throw conflict('You run this class');
      if (!db.t.members.some((m) => m.classId === row.id && m.userId === user.id)) {
        db.t.members.push({ classId: row.id, userId: user.id, joinedAt: iso(ctx.now) });
        const state = learnerOf(db, user.id);
        state.stats = { ...state.stats, classesJoined: state.stats.classesJoined + 1 };
        const locale = localeOf(db, user.id);
        notify(
          db,
          user.id,
          {
            kind: 'class',
            title: say(locale, `You joined ${row.name}`, `Tum ${row.name} me aa gaye`),
            body: say(
              locale,
              'Your teacher can now see your progress.',
              'Ab tumhare teacher tumhari progress dekh sakte hain.',
            ),
            link: '/classes',
          },
          ctx.now,
        );
        grantBadges(db, user.id, ctx.now);
        db.touch();
      }
      return summary(row, false);
    },

    'classes.get': (ctx, { params }) => {
      const user = me(ctx);
      const { id } = params as ParamsOf<'classes.get'>;
      const row = load(id);
      const owner = row.ownerId === user.id || user.role === 'admin';
      const member = db.t.members.some((m) => m.classId === id && m.userId === user.id);
      if (!owner && !member) throw notFound('Class');
      simulateDemo(db, ctx.now);
      const monday = weekStart(istDate(ctx.now));
      const from = new Date(Date.parse(`${monday}T00:00:00Z`) - 5.5 * 3_600_000).toISOString();
      const to = new Date(
        Date.parse(`${addDays(monday, 7)}T00:00:00Z`) - 5.5 * 3_600_000,
      ).toISOString();
      const members = owner
        ? db.t.members
            .filter((m) => m.classId === id)
            .map((m) => {
              const state = learnerOf(db, m.userId);
              return {
                userId: m.userId,
                name: db.t.users[m.userId]?.name ?? 'Unknown',
                joinedAt: m.joinedAt,
                conceptsMastered:
                  Object.keys(state.masteredAt).length || state.stats.conceptsMastered,
                xpThisWeek: db.t.xp
                  .filter((x) => x.userId === m.userId && x.at >= from && x.at < to)
                  .reduce((sum, x) => sum + x.amount, 0),
                lastActiveOn: state.streak.lastActiveOn,
              };
            })
            .sort((a, b) => b.xpThisWeek - a.xpThisWeek)
        : [];
      return { ...summary(row, owner), members };
    },

    'classes.leave': (ctx, { params }) => {
      const user = me(ctx);
      const { id } = params as ParamsOf<'classes.leave'>;
      const at = db.t.members.findIndex((m) => m.classId === id && m.userId === user.id);
      if (at < 0) throw notFound('Membership');
      db.t.members.splice(at, 1);
      db.touch();
      return { ok: true };
    },

    'admin.classes.list': (_ctx, { query }) => {
      const rows = [...db.t.classes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(rows, query);
      return { items: page.items.map((c) => summary(c, true)), nextCursor: page.nextCursor };
    },

    'admin.classes.create': (ctx, { body }) => {
      const admin = me(ctx);
      const input = body as engagement.CreateClass;
      const ownerId = input.ownerId ?? admin.id;
      const owner = db.t.users[ownerId];
      if (!owner || owner.role === 'student')
        throw conflict('A class is run by a writer or an admin');
      const row: ClassRow = {
        id: uuid(),
        name: input.name,
        code: newCode(db),
        ownerId,
        createdAt: iso(ctx.now),
      };
      db.t.classes.push(row);
      audit(db, admin, 'class.created', 'class', row.id, { name: row.name }, ctx.now);
      db.touch();
      return summary(row, true);
    },

    'admin.classes.newCode': (ctx, { params }) => {
      const admin = me(ctx);
      const { id } = params as ParamsOf<'admin.classes.newCode'>;
      const row = load(id);
      row.code = newCode(db);
      audit(db, admin, 'class.code_replaced', 'class', id, {}, ctx.now);
      db.touch();
      return summary(row, true);
    },

    'admin.classes.delete': (ctx, { params }) => {
      const admin = me(ctx);
      const { id } = params as ParamsOf<'admin.classes.delete'>;
      const row = load(id);
      db.t.classes = db.t.classes.filter((c) => c.id !== id);
      db.t.members = db.t.members.filter((m) => m.classId !== id);
      audit(db, admin, 'class.deleted', 'class', id, { name: row.name }, ctx.now);
      db.touch();
      return { ok: true };
    },
  };
}
