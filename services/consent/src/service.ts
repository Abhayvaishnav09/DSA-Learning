import { createHash, randomBytes } from 'node:crypto';
import {
  PageQuery,
  platform,
  PRIVACY_SERVICES,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import {
  conflict,
  decodeCursor,
  encodeCursor,
  forbidden,
  internalFetch,
  notFound,
  problems,
  requireInternal,
  requireRole,
  requireUser,
  serviceUrl,
  serviceUrls,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { deletions, deletionSteps, people, requests } from './schema';

export const env = {
  ...serviceUrls(...PRIVACY_SERVICES),
  /** A parent has this long to answer. */
  CONSENT_DAYS: z.coerce.number().int().min(1).default(7),
  /** How often overdue requests are closed; 0 turns the loop off (tests call the internal endpoint). */
  EXPIRE_EVERY_SECONDS: z.coerce.number().int().min(0).default(3600),
  /** Accounts that cannot be deleted: the shared demo logins. */
  PROTECTED_EMAIL_SUFFIX: z.string().default('@demo.logicpath.dev'),
};
export type ConsentConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<ConsentConfig>;
type Request = typeof requests.$inferSelect;

const DAY_MS = 86_400_000;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The services that have to confirm an erasure: all that hold personal data, and this one. */
const STEPS = [...PRIVACY_SERVICES, 'consent'] as const;

export function consentService(config: ConsentConfig): ServiceDefinition<ConsentConfig> {
  const timers: NodeJS.Timeout[] = [];
  const expired = (row: Request, now = new Date()) =>
    row.status === 'pending' &&
    row.requestedAt.getTime() + config.CONSENT_DAYS * DAY_MS < now.getTime();
  const statusOf = (row: Request): Request['status'] => (expired(row) ? 'expired' : row.status);

  /** Starts erasing a person everywhere. Runs inside the caller's transaction. */
  async function startDeletion(ctx: Ctx, tx: Tx, userId: string) {
    const [deletion] = await tx.insert(deletions).values({ userId }).returning();
    await tx
      .insert(deletionSteps)
      .values(STEPS.map((service) => ({ requestId: deletion!.id, service })));
    // This service forgets first: what it holds is the request and an email address.
    await tx.delete(requests).where(eq(requests.userId, userId));
    await tx.delete(people).where(eq(people.userId, userId));
    await tx
      .update(deletionSteps)
      .set({ completedAt: new Date() })
      .where(and(eq(deletionSteps.requestId, deletion!.id), eq(deletionSteps.service, 'consent')));
    await ctx.emit(tx, 'privacy.deletion.requested', { requestId: deletion!.id, userId });
    return deletion!;
  }

  async function deletionStatus(ctx: Ctx, id: string): Promise<platform.DeletionStatus> {
    const [deletion] = await ctx.db.select().from(deletions).where(eq(deletions.id, id));
    if (!deletion) throw notFound('Deletion request');
    const steps = await ctx.db.select().from(deletionSteps).where(eq(deletionSteps.requestId, id));
    return {
      requestId: deletion.id,
      status: deletion.completedAt ? 'completed' : 'pending',
      requestedAt: deletion.requestedAt.toISOString(),
      services: STEPS.map((service) => ({
        service,
        completedAt: steps.find((s) => s.service === service)?.completedAt?.toISOString() ?? null,
      })),
    };
  }

  /** A parent who never answered: the request lapses and the child's account is not kept. */
  async function closeOverdue(ctx: Ctx, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - config.CONSENT_DAYS * DAY_MS);
    const overdue = await ctx.db
      .select()
      .from(requests)
      .where(and(eq(requests.status, 'pending'), lt(requests.requestedAt, cutoff)));
    let closed = 0;
    for (const row of overdue) {
      await ctx.db.transaction(async (tx) => {
        const [locked] = await tx
          .update(requests)
          .set({ status: 'expired', respondedAt: now })
          .where(and(eq(requests.id, row.id), eq(requests.status, 'pending')))
          .returning();
        if (!locked) return;
        await ctx.emit(tx, 'consent.denied', { requestId: row.id, userId: row.userId });
        await startDeletion(ctx, tx, row.userId);
        closed += 1;
      });
    }
    return closed;
  }

  return {
    title: 'LogicPath Consent & Privacy',
    description:
      'Parental consent for learners under 18, and the privacy rights: see my data, delete my data.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'consent',
        types: ['identity.user.registered', 'privacy.deletion.completed'],
        handle: (event) => handle(ctx, event),
      },
    ],
    onStart: (ctx) => {
      if (config.EXPIRE_EVERY_SECONDS > 0) {
        timers.push(
          setInterval(
            () =>
              void closeOverdue(ctx, new Date()).catch((error) =>
                ctx.log.error({ err: error }, 'closing overdue requests failed'),
              ),
            config.EXPIRE_EVERY_SECONDS * 1000,
          ).unref(),
        );
      }
    },
    onStop: () => {
      for (const timer of timers.splice(0)) clearInterval(timer);
    },
    routes: (app, ctx) => {
      const { db } = ctx;
      const byToken = async (token: string, tx: Tx = db, lock = false): Promise<Request> => {
        const query = tx
          .select()
          .from(requests)
          .where(eq(requests.tokenHash, sha256(token)));
        const [row] = await (lock ? query.for('update') : query);
        if (!row) throw notFound('This approval request');
        return row;
      };
      const view = (row: Request): platform.ConsentRequest => ({
        childName: row.childName,
        requestedAt: row.requestedAt.toISOString(),
        status: statusOf(row),
      });

      app.get(
        '/v1/consent/requests/:token',
        {
          schema: {
            tags: ['consent'],
            summary: 'What a parent is asked to approve',
            params: z.object({ token: z.string() }),
            response: { 200: platform.ConsentRequest, 404: problems[404] },
          },
        },
        async (req) => view(await byToken(req.params.token)),
      );

      app.post(
        '/v1/consent/respond',
        {
          schema: {
            tags: ['consent'],
            summary: 'A parent approves or declines',
            body: platform.ConsentDecision,
            response: { 200: platform.ConsentRequest, ...problems },
          },
        },
        async (req) => {
          const { token, decision } = req.body;
          return db.transaction(async (tx) => {
            const row = await byToken(token, tx, true);
            if (statusOf(row) !== 'pending') {
              throw conflict('This request was already answered or has expired');
            }
            const status = decision === 'grant' ? 'granted' : 'denied';
            const [updated] = await tx
              .update(requests)
              .set({ status, respondedAt: new Date() })
              .where(eq(requests.id, row.id))
              .returning();
            if (decision === 'grant') {
              await ctx.emit(tx, 'consent.granted', { requestId: row.id, userId: row.userId });
            } else {
              // Declined: nothing about the child is kept, anywhere.
              await ctx.emit(tx, 'consent.denied', { requestId: row.id, userId: row.userId });
              await startDeletion(ctx, tx, row.userId);
            }
            return view(updated ?? row);
          });
        },
      );

      app.get(
        '/v1/privacy/export',
        {
          schema: {
            tags: ['privacy'],
            summary: 'Download all my data',
            security: [{ bearer: [] }],
            response: { 200: platform.DataExport, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const parts = await Promise.all(
            PRIVACY_SERVICES.map(async (name) => {
              try {
                const reply = await internalFetch<{ data: unknown }>(
                  config,
                  `${serviceUrl(config, name)}/internal/users/${me.id}/export`,
                  {},
                  8_000,
                );
                return [name, reply.data] as const;
              } catch (error) {
                ctx.log.warn({ err: error, service: name }, 'export part unavailable');
                return [name, { unavailable: true }] as const;
              }
            }),
          );
          const mine = await db.select().from(requests).where(eq(requests.userId, me.id));
          return {
            userId: me.id,
            generatedAt: new Date().toISOString(),
            services: {
              ...Object.fromEntries(parts),
              consent: mine.map((r) => ({ ...view(r), parentEmail: r.parentEmail })),
            },
          };
        },
      );

      app.delete(
        '/v1/privacy/me',
        {
          schema: {
            tags: ['privacy'],
            summary: 'Delete my account and data',
            security: [{ bearer: [] }],
            response: { 202: platform.DeletionStatus, ...problems },
          },
        },
        async (req, reply) => {
          const me = requireUser(req);
          const [person] = await db.select().from(people).where(eq(people.userId, me.id));
          if (person?.email.endsWith(config.PROTECTED_EMAIL_SUFFIX)) {
            throw forbidden(
              'The shared demo accounts cannot be deleted. Create your own account to try this.',
            );
          }
          const deletion = await db.transaction((tx) => startDeletion(ctx, tx, me.id));
          return reply.status(202).send(await deletionStatus(ctx, deletion.id));
        },
      );

      app.get(
        '/v1/privacy/deletions/:id',
        {
          schema: {
            tags: ['privacy'],
            summary: 'How far a deletion has got',
            params: z.object({ id: z.uuid() }),
            response: { 200: platform.DeletionStatus, 404: problems[404] },
          },
        },
        async (req) => deletionStatus(ctx, req.params.id),
      );

      app.get(
        '/v1/admin/consent',
        {
          schema: {
            tags: ['consent'],
            summary: 'Parental consent requests',
            security: [{ bearer: [] }],
            querystring: PageQuery,
            response: { 200: platform.PendingConsentPage, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const { limit } = req.query;
          const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
          const rows = await db
            .select()
            .from(requests)
            .where(
              cursor
                ? or(
                    lt(requests.requestedAt, new Date(cursor.c)),
                    and(eq(requests.requestedAt, new Date(cursor.c)), lt(requests.id, cursor.id)),
                  )
                : undefined,
            )
            .orderBy(desc(requests.requestedAt), desc(requests.id))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return {
            items: page.map((r) => ({
              requestId: r.id,
              userId: r.userId,
              childName: r.childName,
              parentEmail: r.parentEmail,
              requestedAt: r.requestedAt.toISOString(),
              status: statusOf(r),
            })),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ c: last.requestedAt.toISOString(), id: last.id })
                : null,
          };
        },
      );

      app.post(
        '/internal/consent/close-overdue',
        { schema: { hide: true, body: z.object({ now: z.iso.datetime().optional() }).nullish() } },
        async (req) => {
          requireInternal(req, config);
          const now = req.body?.now ? new Date(req.body.now) : new Date();
          return { closed: await closeOverdue(ctx, now) };
        },
      );
    },
  };
}

async function handle(ctx: Ctx, event: EventEnvelope) {
  await ctx.once('consent', event, async (tx) => {
    if (event.type === 'identity.user.registered') {
      const d = event.data as EventData<'identity.user.registered'>;
      await tx
        .insert(people)
        .values({ userId: d.userId, email: d.email })
        .onConflictDoUpdate({ target: people.userId, set: { email: d.email } });
      // A child's account waits for a parent: ask them, by email, with a link only they have.
      if (d.status === 'pending_consent' && d.parentEmail) {
        const token = randomBytes(32).toString('base64url');
        const [request] = await tx
          .insert(requests)
          .values({
            userId: d.userId,
            childName: d.name,
            parentEmail: d.parentEmail,
            locale: d.locale,
            tokenHash: sha256(token),
          })
          .returning();
        await ctx.emit(tx, 'consent.requested', {
          requestId: request!.id,
          userId: d.userId,
          parentEmail: d.parentEmail,
          childName: d.name,
          locale: d.locale,
          token,
        });
      }
    } else if (event.type === 'privacy.deletion.completed') {
      const { requestId, service } = event.data as EventData<'privacy.deletion.completed'>;
      await tx
        .update(deletionSteps)
        .set({ completedAt: new Date() })
        .where(
          and(
            eq(deletionSteps.requestId, requestId),
            eq(deletionSteps.service, service),
            isNull(deletionSteps.completedAt),
          ),
        );
      const waiting = await tx
        .select({ service: deletionSteps.service })
        .from(deletionSteps)
        .where(and(eq(deletionSteps.requestId, requestId), isNull(deletionSteps.completedAt)));
      if (waiting.length === 0) {
        await tx
          .update(deletions)
          .set({ completedAt: new Date() })
          .where(and(eq(deletions.id, requestId), isNull(deletions.completedAt)));
      }
    }
  });
}
