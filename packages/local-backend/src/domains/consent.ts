import { fail, type LocalHandler } from '@logicpath/api-client/local';
import type { ParamsOf, platform } from '@logicpath/contracts';
import { DEMO_ACCOUNTS } from '../accounts';
import type { ConsentRow, LocalDb } from '../db';
import { audit, forbidden, iso, me, notFound, paginate, uuid } from '../util';
import { CONSENT_DAYS, sendMail, toUser, welcome } from './identity';

/** Parental consent (DPDP Act) and the privacy rights: see my data, delete my data. */

const SERVICES = ['identity', 'profile', 'progress', 'gamification', 'notification', 'classroom'];

export function consentHandlers(db: LocalDb): Record<string, LocalHandler> {
  const find = (token: string, now: Date): ConsentRow => {
    const row = db.t.consents.find((c) => c.token === token);
    if (!row) throw notFound('This approval request');
    const expired = Date.parse(row.requestedAt) + CONSENT_DAYS * 86_400_000 < now.getTime();
    if (row.status === 'pending' && expired) row.status = 'expired';
    return row;
  };
  const view = (row: ConsentRow): platform.ConsentRequest => ({
    childName: row.childName,
    requestedAt: row.requestedAt,
    status: row.status,
  });

  /** Removes everything about a person from every part of the demo. */
  function erase(userId: string) {
    const t = db.t;
    delete t.users[userId];
    delete t.profiles[userId];
    delete t.learners[userId];
    delete t.badges[userId];
    delete t.leagues[userId];
    delete t.leagueHistory[userId];
    delete t.notificationPrefs[userId];
    t.attempts = t.attempts.filter((a) => a.userId !== userId);
    t.xp = t.xp.filter((x) => x.userId !== userId);
    t.members = t.members.filter((m) => m.userId !== userId);
    t.notifications = t.notifications.filter((n) => n.userId !== userId);
    t.consents = t.consents.filter((c) => c.userId !== userId);
    t.apiKeys = t.apiKeys.filter((k) => k.ownerId !== userId);
    t.media = t.media.filter((m) => m.uploadedBy !== userId);
    for (const [token, s] of Object.entries(t.sessions))
      if (s.userId === userId) delete t.sessions[token];
    for (const [token, r] of Object.entries(t.tokens))
      if (r.userId === userId) delete t.tokens[token];
  }

  return {
    'consent.request': (ctx, { params }) =>
      view(find((params as ParamsOf<'consent.request'>).token, ctx.now)),

    'consent.respond': (ctx, { body }) => {
      const { token, decision } = body as platform.ConsentDecision;
      const row = find(token, ctx.now);
      if (row.status !== 'pending') {
        throw fail(409, 'Conflict', 'This request was already answered or has expired', 'conflict');
      }
      const child = db.t.users[row.userId];
      if (decision === 'grant') {
        row.status = 'granted';
        if (child) {
          child.status = 'active';
          welcome(db, child, ctx.now);
          sendMail(
            db,
            {
              to: child.email,
              subject: 'Your account is approved',
              body: 'A parent or guardian approved your LogicPath account. You can sign in now.',
              link: '/login',
            },
            ctx.now,
          );
        }
      } else {
        // Declined: nothing about the child is kept.
        row.status = 'denied';
        erase(row.userId);
        db.t.consents.unshift(row);
      }
      db.touch();
      return view(row);
    },

    'privacy.export': (ctx) => {
      const user = me(ctx);
      const t = db.t;
      return {
        userId: user.id,
        generatedAt: iso(ctx.now),
        services: {
          identity: toUser(t.users[user.id]!),
          profile: t.profiles[user.id] ?? null,
          progress: {
            state: t.learners[user.id] ?? null,
            attempts: t.attempts.filter((a) => a.userId === user.id),
          },
          gamification: {
            xp: t.xp.filter((x) => x.userId === user.id),
            badges: t.badges[user.id] ?? [],
          },
          notification: {
            inbox: t.notifications.filter((n) => n.userId === user.id),
            preferences: t.notificationPrefs[user.id] ?? null,
          },
          classroom: t.members.filter((m) => m.userId === user.id),
        },
      };
    },

    'privacy.delete': (ctx) => {
      const user = me(ctx);
      const row = db.t.users[user.id]!;
      if (DEMO_ACCOUNTS.some((a) => a.email === row.email)) {
        throw forbidden(
          'The shared demo accounts cannot be deleted. Create your own account to try this.',
        );
      }
      const requestId = uuid();
      db.t.deletions.push({ id: requestId, userId: user.id, requestedAt: iso(ctx.now) });
      audit(db, null, 'account.deleted', 'user', user.id, {}, ctx.now);
      erase(user.id);
      db.touch();
      return {
        requestId,
        status: 'completed',
        requestedAt: iso(ctx.now),
        services: SERVICES.map((service) => ({ service, completedAt: iso(ctx.now) })),
      };
    },

    'privacy.deletion': (_ctx, { params }) => {
      const { id } = params as ParamsOf<'privacy.deletion'>;
      const row = db.t.deletions.find((d) => d.id === id);
      if (!row) throw notFound('Deletion request');
      return {
        requestId: row.id,
        status: 'completed',
        requestedAt: row.requestedAt,
        services: SERVICES.map((service) => ({ service, completedAt: row.requestedAt })),
      };
    },

    'admin.consent.list': (_ctx, { query }) => {
      const page = paginate(db.t.consents, query);
      return {
        items: page.items.map((c) => ({
          requestId: c.id,
          userId: c.userId,
          childName: c.childName,
          parentEmail: c.parentEmail,
          requestedAt: c.requestedAt,
          status: c.status,
        })),
        nextCursor: page.nextCursor,
      };
    },
  };
}
