import {
  engagement,
  Ok,
  PageQuery,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import {
  decodeCursor,
  encodeCursor,
  notFound,
  problems,
  requireInternal,
  requireUser,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { and, count, desc, eq, isNull, lt, lte, or } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { notes, mails as templates, type Locale, type Mail, type Note } from './messages';
import { cardDue, mails, notifications, people, prefs, reminders, submissions } from './schema';

export const env = {
  /** Links in emails start with this: where the website lives. */
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  /** e.g. smtp://user:password@smtp.example.com:587. Without it emails are written to the log, not sent. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('LogicPath <no-reply@logicpath.dev>'),
  /** How often waiting emails are sent; 0 turns the loop off (tests call the internal endpoint). */
  MAIL_EVERY_SECONDS: z.coerce.number().int().min(0).default(5),
  /** How often review reminders are looked for; 0 turns the loop off. */
  REMINDER_EVERY_SECONDS: z.coerce.number().int().min(0).default(300),
};
export type NotificationConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<NotificationConfig>;

const DEFAULT_PREFS: engagement.NotificationPrefs = {
  reviewReminders: true,
  weeklySummary: true,
  productNews: false,
};
const DEFAULT_ZONE = 'Asia/Kolkata';
const MAX_MAIL_ATTEMPTS = 5;

/** The calendar date (YYYY-MM-DD) in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return localDate(at, DEFAULT_ZONE);
  }
}

type Row = typeof notifications.$inferSelect;
const toNotification = (row: Row): engagement.Notification => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export function notificationService(
  config: NotificationConfig,
): ServiceDefinition<NotificationConfig> {
  const transporter = config.SMTP_URL
    ? nodemailer.createTransport({
        url: config.SMTP_URL,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      })
    : null;
  const web = config.PUBLIC_WEB_URL.replace(/\/$/, '');
  const timers: NodeJS.Timeout[] = [];

  // ---------- helpers that write ----------

  async function localeOf(tx: Tx, userId: string): Promise<Locale> {
    const [person] = await tx.select().from(people).where(eq(people.userId, userId));
    return person?.locale ?? 'en';
  }

  async function notify(tx: Tx, userId: string, note: Note | null, dedupeKey: string) {
    if (!note) return;
    await tx
      .insert(notifications)
      .values({ userId, ...note, dedupeKey })
      .onConflictDoNothing();
  }

  async function queueMail(
    tx: Tx,
    mail: Mail,
    to: { email: string; userId: string | null },
    dedupeKey: string,
  ) {
    await tx
      .insert(mails)
      .values({ toEmail: to.email, userId: to.userId, ...mail, dedupeKey })
      .onConflictDoNothing();
  }

  // ---------- background work ----------

  /** Sends what is waiting. Without SMTP settings it only writes the email to the log. */
  async function flushMails(ctx: Ctx): Promise<number> {
    return ctx.db.transaction(async (tx) => {
      const waiting = await tx
        .select()
        .from(mails)
        .where(and(eq(mails.status, 'queued'), lte(mails.nextAttemptAt, new Date())))
        .orderBy(mails.createdAt)
        .limit(20)
        .for('update', { skipLocked: true });
      for (const mail of waiting) {
        if (!transporter) {
          ctx.log.info(
            { to: mail.toEmail, subject: mail.subject, text: mail.text },
            'email not sent: no SMTP_URL is set',
          );
          await tx.update(mails).set({ status: 'skipped' }).where(eq(mails.id, mail.id));
          continue;
        }
        try {
          await transporter.sendMail({
            from: config.MAIL_FROM,
            to: mail.toEmail,
            subject: mail.subject,
            text: mail.text,
          });
          await tx
            .update(mails)
            .set({
              status: 'sent',
              sentAt: new Date(),
              attempts: mail.attempts + 1,
              lastError: null,
            })
            .where(eq(mails.id, mail.id));
        } catch (error) {
          const attempts = mail.attempts + 1;
          ctx.log.warn({ err: error, to: mail.toEmail, attempts }, 'email failed');
          await tx
            .update(mails)
            .set({
              attempts,
              lastError: String(error).slice(0, 500),
              status: attempts >= MAX_MAIL_ATTEMPTS ? 'failed' : 'queued',
              nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000),
            })
            .where(eq(mails.id, mail.id));
        }
      }
      return waiting.length;
    });
  }

  /** One reminder per person per local day, when cards are due and they have not asked for silence. */
  async function remindOfReviews(ctx: Ctx, now: Date): Promise<number> {
    const due = await ctx.db
      .select({ userId: cardDue.userId, n: count() })
      .from(cardDue)
      .where(lte(cardDue.due, now))
      .groupBy(cardDue.userId);
    let reminded = 0;
    for (const { userId, n } of due) {
      await ctx.db.transaction(async (tx) => {
        const [pref] = await tx.select().from(prefs).where(eq(prefs.userId, userId));
        if (pref && !pref.reviewReminders) return;
        const [person] = await tx.select().from(people).where(eq(people.userId, userId));
        const today = localDate(now, person?.timeZone ?? DEFAULT_ZONE);
        const [last] = await tx
          .select()
          .from(reminders)
          .where(eq(reminders.userId, userId))
          .for('update');
        if (last?.lastRemindedOn === today) return;
        await notify(
          tx,
          userId,
          notes.reviewsDue(person?.locale ?? 'en', Number(n)),
          `review:${userId}:${today}`,
        );
        await tx
          .insert(reminders)
          .values({ userId, lastRemindedOn: today })
          .onConflictDoUpdate({ target: reminders.userId, set: { lastRemindedOn: today } });
        reminded += 1;
      });
    }
    return reminded;
  }

  return {
    title: 'LogicPath Notifications',
    description: 'The inbox, notification preferences, and the emails the platform sends.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'notification',
        types: [
          'identity.user.registered',
          'identity.user.email_verification_requested',
          'identity.user.password_reset_requested',
          'profile.updated',
          'consent.requested',
          'consent.granted',
          'authoring.submission.approved',
          'authoring.submission.rejected',
          'content.version.published',
          'content.publish.failed',
          'gamification.level.up',
          'gamification.badge.earned',
          'leaderboard.week.closed',
          'classroom.member.joined',
          'review.card.scheduled',
          'privacy.deletion.requested',
        ],
        handle: (event) => handle(ctx, event),
      },
    ],
    onStart: (ctx) => {
      if (config.MAIL_EVERY_SECONDS > 0) {
        timers.push(
          setInterval(
            () =>
              void flushMails(ctx).catch((error) =>
                ctx.log.error({ err: error }, 'mail loop failed'),
              ),
            config.MAIL_EVERY_SECONDS * 1000,
          ).unref(),
        );
      }
      if (config.REMINDER_EVERY_SECONDS > 0) {
        timers.push(
          setInterval(
            () =>
              void remindOfReviews(ctx, new Date()).catch((error) =>
                ctx.log.error({ err: error }, 'reminder loop failed'),
              ),
            config.REMINDER_EVERY_SECONDS * 1000,
          ).unref(),
        );
      }
    },
    onStop: () => {
      for (const timer of timers.splice(0)) clearInterval(timer);
      transporter?.close();
    },
    routes: (app, ctx) => {
      const { db } = ctx;

      app.get(
        '/v1/notifications',
        {
          schema: {
            tags: ['notifications'],
            summary: 'My inbox, newest first',
            security: [{ bearer: [] }],
            querystring: PageQuery,
            response: { 200: engagement.NotificationPage, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const { limit } = req.query;
          const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
          const rows = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, me.id),
                cursor
                  ? or(
                      lt(notifications.createdAt, new Date(cursor.c)),
                      and(
                        eq(notifications.createdAt, new Date(cursor.c)),
                        lt(notifications.id, cursor.id),
                      ),
                    )
                  : undefined,
              ),
            )
            .orderBy(desc(notifications.createdAt), desc(notifications.id))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          const [{ unread }] = (await db
            .select({ unread: count() })
            .from(notifications)
            .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)))) as [
            { unread: number },
          ];
          return {
            items: page.map(toNotification),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
                : null,
            unreadCount: Number(unread),
          };
        },
      );

      app.post(
        '/v1/notifications/:id/read',
        {
          schema: {
            tags: ['notifications'],
            summary: 'Mark one notification read',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const [row] = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, me.id)));
          if (!row) throw notFound('Notification');
          await db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(and(eq(notifications.id, row.id), isNull(notifications.readAt)));
          return { ok: true as const };
        },
      );

      app.post(
        '/v1/notifications/read-all',
        {
          schema: {
            tags: ['notifications'],
            summary: 'Mark everything read',
            security: [{ bearer: [] }],
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          await db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
          return { ok: true as const };
        },
      );

      app.get(
        '/v1/notifications/preferences',
        {
          schema: {
            tags: ['notifications'],
            summary: 'What I want to hear about',
            security: [{ bearer: [] }],
            response: { 200: engagement.NotificationPrefs, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const [row] = await db.select().from(prefs).where(eq(prefs.userId, me.id));
          return row
            ? {
                reviewReminders: row.reviewReminders,
                weeklySummary: row.weeklySummary,
                productNews: row.productNews,
              }
            : DEFAULT_PREFS;
        },
      );

      app.put(
        '/v1/notifications/preferences',
        {
          schema: {
            tags: ['notifications'],
            summary: 'Change what I hear about',
            security: [{ bearer: [] }],
            body: engagement.NotificationPrefs,
            response: { 200: engagement.NotificationPrefs, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          await db
            .insert(prefs)
            .values({ userId: me.id, ...req.body })
            .onConflictDoUpdate({ target: prefs.userId, set: req.body });
          return req.body;
        },
      );

      // ---------- internal ----------

      app.post('/internal/mail/flush', { schema: { hide: true } }, async (req) => {
        requireInternal(req, config);
        return { sent: await flushMails(ctx) };
      });

      app.post(
        '/internal/reminders/run',
        { schema: { hide: true, body: z.object({ now: z.iso.datetime().optional() }).nullish() } },
        async (req) => {
          requireInternal(req, config);
          const now = req.body?.now ? new Date(req.body.now) : new Date();
          return { reminded: await remindOfReviews(ctx, now) };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const inbox = await db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, req.params.id))
            .orderBy(desc(notifications.createdAt))
            .limit(500);
          const [preferences] = await db
            .select()
            .from(prefs)
            .where(eq(prefs.userId, req.params.id));
          return {
            service: 'notification',
            data: { inbox: inbox.map(toNotification), preferences: preferences ?? null },
          };
        },
      );
    },
  };

  // ---------- reacting to what happened elsewhere ----------

  async function handle(ctx: Ctx, event: EventEnvelope) {
    await ctx.once('notification', event, async (tx) => {
      const at = (userId: string) => `${event.id}:${userId}`;
      switch (event.type) {
        case 'identity.user.registered': {
          const d = event.data as EventData<'identity.user.registered'>;
          await tx
            .insert(people)
            .values({ userId: d.userId, email: d.email, name: d.name, locale: d.locale })
            .onConflictDoUpdate({
              target: people.userId,
              set: { email: d.email, locale: d.locale },
            });
          // A child's account starts when a parent approves; the welcome waits for that.
          if (d.status === 'active') {
            await notify(tx, d.userId, notes.welcome(d.locale), `welcome:${d.userId}`);
          }
          break;
        }
        case 'identity.user.email_verification_requested': {
          const d = event.data as EventData<'identity.user.email_verification_requested'>;
          await queueMail(
            tx,
            templates.verifyEmail(d.locale, d.name, `${web}/verify-email?token=${d.token}`),
            { email: d.email, userId: d.userId },
            at(d.userId),
          );
          break;
        }
        case 'identity.user.password_reset_requested': {
          const d = event.data as EventData<'identity.user.password_reset_requested'>;
          await queueMail(
            tx,
            templates.resetPassword(d.locale, d.name, `${web}/reset-password?token=${d.token}`),
            { email: d.email, userId: d.userId },
            at(d.userId),
          );
          break;
        }
        case 'profile.updated': {
          const d = event.data as EventData<'profile.updated'>;
          await tx
            .insert(people)
            .values({
              userId: d.userId,
              name: d.displayName,
              locale: d.locale,
              timeZone: d.timeZone,
            })
            .onConflictDoUpdate({
              target: people.userId,
              set: { name: d.displayName, locale: d.locale, timeZone: d.timeZone },
            });
          break;
        }
        case 'consent.requested': {
          const d = event.data as EventData<'consent.requested'>;
          await queueMail(
            tx,
            templates.parentConsent(d.locale, d.childName, `${web}/consent/${d.token}`),
            { email: d.parentEmail, userId: d.userId },
            at(d.userId),
          );
          break;
        }
        case 'consent.granted': {
          const d = event.data as EventData<'consent.granted'>;
          const [child] = await tx.select().from(people).where(eq(people.userId, d.userId));
          const locale = child?.locale ?? 'en';
          await notify(tx, d.userId, notes.welcome(locale), `welcome:${d.userId}`);
          if (child?.email) {
            await queueMail(
              tx,
              templates.approved(locale, `${web}/login`),
              { email: child.email, userId: d.userId },
              at(d.userId),
            );
          }
          break;
        }
        case 'authoring.submission.approved': {
          const d = event.data as EventData<'authoring.submission.approved'>;
          await tx
            .insert(submissions)
            .values({ submissionId: d.submissionId, authorId: d.authorId, title: d.title })
            .onConflictDoNothing();
          break;
        }
        case 'authoring.submission.rejected': {
          const d = event.data as EventData<'authoring.submission.rejected'>;
          await notify(
            tx,
            d.authorId,
            notes.changesRequested(
              await localeOf(tx, d.authorId),
              d.title,
              d.comment,
              d.submissionId,
            ),
            at(d.authorId),
          );
          break;
        }
        case 'content.version.published': {
          const d = event.data as EventData<'content.version.published'>;
          if (!d.submissionId) break; // a rollback: nobody to tell
          const [submission] = await tx
            .select()
            .from(submissions)
            .where(eq(submissions.submissionId, d.submissionId));
          // The approval and the publish travel on different streams: wait for the approval.
          if (!submission) throw new Error(`submission ${d.submissionId} not known yet`);
          await notify(
            tx,
            submission.authorId,
            notes.published(
              await localeOf(tx, submission.authorId),
              submission.title,
              d.submissionId,
            ),
            at(submission.authorId),
          );
          break;
        }
        case 'content.publish.failed': {
          const d = event.data as EventData<'content.publish.failed'>;
          const [submission] = await tx
            .select()
            .from(submissions)
            .where(eq(submissions.submissionId, d.submissionId));
          if (!submission) throw new Error(`submission ${d.submissionId} not known yet`);
          await notify(
            tx,
            submission.authorId,
            notes.publishFailed(
              await localeOf(tx, submission.authorId),
              submission.title,
              d.issues[0]?.message ?? 'The content did not pass its checks.',
              d.submissionId,
            ),
            at(submission.authorId),
          );
          break;
        }
        case 'gamification.level.up': {
          const d = event.data as EventData<'gamification.level.up'>;
          await notify(
            tx,
            d.userId,
            notes.levelUp(await localeOf(tx, d.userId), d.level),
            at(d.userId),
          );
          break;
        }
        case 'gamification.badge.earned': {
          const d = event.data as EventData<'gamification.badge.earned'>;
          await notify(
            tx,
            d.userId,
            notes.badge(await localeOf(tx, d.userId), d.badgeId),
            at(d.userId),
          );
          break;
        }
        case 'leaderboard.week.closed': {
          const d = event.data as EventData<'leaderboard.week.closed'>;
          await notify(tx, d.userId, notes.league(await localeOf(tx, d.userId), d), at(d.userId));
          break;
        }
        case 'classroom.member.joined': {
          const d = event.data as EventData<'classroom.member.joined'>;
          await notify(
            tx,
            d.userId,
            notes.joinedClass(await localeOf(tx, d.userId), d.className),
            at(d.userId),
          );
          break;
        }
        case 'review.card.scheduled': {
          const d = event.data as EventData<'review.card.scheduled'>;
          await tx
            .insert(cardDue)
            .values({ userId: d.userId, cardId: d.cardId, due: new Date(d.due) })
            .onConflictDoUpdate({
              target: [cardDue.userId, cardDue.cardId],
              set: { due: new Date(d.due) },
            });
          break;
        }
        case 'privacy.deletion.requested': {
          const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
          await tx.delete(notifications).where(eq(notifications.userId, userId));
          await tx.delete(prefs).where(eq(prefs.userId, userId));
          await tx.delete(people).where(eq(people.userId, userId));
          await tx.delete(cardDue).where(eq(cardDue.userId, userId));
          await tx.delete(reminders).where(eq(reminders.userId, userId));
          await tx.delete(submissions).where(eq(submissions.authorId, userId));
          await tx.delete(mails).where(eq(mails.userId, userId));
          await ctx.emit(tx, 'privacy.deletion.completed', {
            requestId,
            userId,
            service: 'notification',
          });
          break;
        }
        default:
          break;
      }
    });
  }
}
