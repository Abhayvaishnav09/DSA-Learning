import { fileURLToPath } from 'node:url';
import { decide, type Actor, type DraftAction } from '@logicpath/authoring-workflow';
import type { ContentBundle } from '@logicpath/content-schema';
import { validateChanges } from '@logicpath/content-tools/browser';
import {
  authoring,
  Id,
  Ok,
  Problem,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import type { AuthUser, loadConfig } from '@logicpath/service-kit';
import {
  badRequest,
  conflict,
  decodeCursor,
  encodeCursor,
  forbidden,
  HttpProblem,
  internalFetch,
  notFound,
  requireInternal,
  requireRole,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { and, asc, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { activity, drafts, snapshot } from './schema';

export const env = {
  CONTENT_URL: z.url().default('http://127.0.0.1:4104'),
};
export type AuthoringConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<AuthoringConfig>;
type DraftRow = typeof drafts.$inferSelect;
type ActivityAction = (typeof activity.$inferInsert)['action'];

const toSummary = (row: DraftRow): authoring.DraftSummary => ({
  id: row.id,
  title: row.title,
  status: row.status,
  authorId: row.authorId,
  authorName: row.authorName,
  changeCount: row.changes.length,
  updatedAt: row.updatedAt.toISOString(),
  submittedAt: row.submittedAt?.toISOString() ?? null,
  publishedVersion: row.publishedVersion,
});

/** Turns a workflow refusal into the right HTTP error. */
function allow(action: DraftAction, row: DraftRow, actor: Actor | null) {
  const decision = decide(action, row, actor);
  if (!decision.ok) {
    throw decision.reason === 'forbidden'
      ? forbidden(decision.message)
      : conflict(decision.message);
  }
  return decision.next;
}

async function record(
  tx: Tx,
  draftId: string,
  actor: AuthUser | null,
  action: ActivityAction,
  comment: string | null = null,
) {
  await tx.insert(activity).values({
    draftId,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? 'LogicPath',
    action,
    comment,
  });
}

export function authoringService(config: AuthoringConfig): ServiceDefinition<AuthoringConfig> {
  return {
    title: 'LogicPath Authoring',
    description:
      'Content writers draft changes to the curriculum, validate them against the live content ' +
      'and submit them for review. Admins approve (which publishes) or request changes.',
    config,
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),

    onStart: async (ctx) => {
      // Warm the read model; if content isn't up yet, the first request or event fills it.
      await refreshSnapshot(ctx).catch((error: unknown) =>
        ctx.log.warn({ err: error }, 'content snapshot not loaded yet'),
      );
    },

    consumers: (ctx) => [
      {
        name: 'authoring',
        types: [
          'content.version.published',
          'content.publish.failed',
          'privacy.deletion.requested',
        ],
        handle: (event) => handle(ctx, event),
      },
    ],

    routes: (app, ctx) => {
      const { db } = ctx;
      /** The live curriculum, fetched from the content service when the read model is empty. */
      async function liveContent(ctx: Ctx): Promise<{ number: number; bundle: ContentBundle }> {
        const [row] = await ctx.db.select().from(snapshot).where(eq(snapshot.id, 1));
        if (row) return row;
        await refreshSnapshot(ctx);
        const [fresh] = await ctx.db.select().from(snapshot).where(eq(snapshot.id, 1));
        if (!fresh) throw new HttpProblem(503, 'unavailable', 'Content is not available yet');
        return fresh;
      }

      async function load(id: string): Promise<DraftRow> {
        const [row] = await db.select().from(drafts).where(eq(drafts.id, id));
        if (!row) throw notFound('Draft');
        return row;
      }

      async function full(row: DraftRow): Promise<authoring.Draft> {
        const history = await db
          .select()
          .from(activity)
          .where(eq(activity.draftId, row.id))
          .orderBy(asc(activity.at), asc(activity.id));
        return {
          ...toSummary(row),
          changes: row.changes,
          baseVersion: row.baseVersion,
          issues: row.issues,
          activity: history.map((a) => ({ ...a, at: a.at.toISOString() })),
        };
      }

      async function listDrafts(
        filter: SQL | undefined,
        query: z.infer<typeof authoring.DraftQuery>,
      ): Promise<z.infer<typeof authoring.DraftPage>> {
        const cursor = decodeCursor<{ u: string; id: string }>(query.cursor);
        const rows = await db
          .select()
          .from(drafts)
          .where(
            and(
              filter,
              query.status ? eq(drafts.status, query.status) : undefined,
              cursor
                ? or(
                    lt(drafts.updatedAt, new Date(cursor.u)),
                    and(eq(drafts.updatedAt, new Date(cursor.u)), lt(drafts.id, cursor.id)),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(drafts.updatedAt), desc(drafts.id))
          .limit(query.limit + 1);
        const page = rows.slice(0, query.limit);
        const last = page.at(-1);
        return {
          items: page.map(toSummary),
          nextCursor:
            rows.length > query.limit && last
              ? encodeCursor({ u: last.updatedAt.toISOString(), id: last.id })
              : null,
        };
      }

      const security = [{ bearer: [] }];
      const errors = { 400: Problem, 401: Problem, 403: Problem, 404: Problem, 409: Problem };
      const idParams = z.object({ id: Id });

      // ---------- writer studio ----------

      app.get(
        '/v1/studio/drafts',
        {
          schema: {
            tags: ['studio'],
            summary: 'My drafts, most recently changed first',
            security,
            querystring: authoring.DraftQuery,
            response: { 200: authoring.DraftPage, 401: Problem, 403: Problem },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          return listDrafts(eq(drafts.authorId, me.id), req.query);
        },
      );

      app.post(
        '/v1/studio/drafts',
        {
          schema: {
            tags: ['studio'],
            summary: 'Start a draft',
            security,
            body: authoring.CreateDraft,
            response: { 201: authoring.Draft, ...errors },
          },
        },
        async (req, reply) => {
          const me = requireRole(req, 'writer');
          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(drafts)
              .values({
                title: req.body.title,
                changes: req.body.changes,
                authorId: me.id,
                authorName: me.name,
              })
              .returning();
            await record(tx, created!.id, me, 'created');
            return created!;
          });
          return reply.status(201).send(await full(row));
        },
      );

      app.get(
        '/v1/studio/drafts/:id',
        {
          schema: {
            tags: ['studio'],
            summary: 'One draft with its changes, problems and history',
            security,
            params: idParams,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          const row = await load(req.params.id);
          if (me.role !== 'admin' && row.authorId !== me.id) throw notFound('Draft');
          return full(row);
        },
      );

      app.patch(
        '/v1/studio/drafts/:id',
        {
          schema: {
            tags: ['studio'],
            summary: 'Edit a draft (only while it is a draft or needs changes)',
            security,
            params: idParams,
            body: authoring.UpdateDraft,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          const row = await db.transaction(async (tx) => {
            const [current] = await tx
              .select()
              .from(drafts)
              .where(eq(drafts.id, req.params.id))
              .for('update');
            if (!current) throw notFound('Draft');
            allow('edit', current, me);
            const [updated] = await tx
              .update(drafts)
              .set({ ...req.body, updatedAt: new Date() })
              .where(eq(drafts.id, current.id))
              .returning();
            await record(tx, current.id, me, 'edited');
            return updated!;
          });
          return full(row);
        },
      );

      app.delete(
        '/v1/studio/drafts/:id',
        {
          schema: {
            tags: ['studio'],
            summary: 'Delete a draft that was never submitted',
            security,
            params: idParams,
            response: { 200: Ok, ...errors },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          const row = await load(req.params.id);
          allow('delete', row, me);
          await db.delete(drafts).where(and(eq(drafts.id, row.id), eq(drafts.status, 'draft')));
          return { ok: true as const };
        },
      );

      app.post(
        '/v1/studio/drafts/:id/validate',
        {
          schema: {
            tags: ['studio'],
            summary: 'Check the draft against the live curriculum',
            description:
              'Applies the changes to the live content and runs every check (programs run, answer ' +
              'keys match, references resolve). Errors anywhere block submission; warnings are shown ' +
              'only for what the draft touches.',
            security,
            params: idParams,
            response: { 200: authoring.Validation, ...errors },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          const row = await load(req.params.id);
          if (me.role !== 'admin' && row.authorId !== me.id) throw notFound('Draft');
          const live = await liveContent(ctx);
          const issues = validateChanges(live.bundle, row.changes);
          await db
            .update(drafts)
            .set({ issues, baseVersion: live.bundle.version })
            .where(eq(drafts.id, row.id));
          return {
            ok: !issues.some((i) => i.severity === 'error'),
            baseVersion: live.bundle.version,
            issues,
          };
        },
      );

      app.post(
        '/v1/studio/drafts/:id/submit',
        {
          schema: {
            tags: ['studio'],
            summary: 'Send the draft for review',
            description: 'Validates first; a draft with errors is refused with 400 and the issues.',
            security,
            params: idParams,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          const live = await liveContent(ctx);
          const row = await db.transaction(async (tx) => {
            const [current] = await tx
              .select()
              .from(drafts)
              .where(eq(drafts.id, req.params.id))
              .for('update');
            if (!current) throw notFound('Draft');
            const next = allow('submit', current, me);
            if (current.changes.length === 0) throw badRequest('The draft has no changes yet');
            const issues = validateChanges(live.bundle, current.changes);
            const blocking = issues.filter((i) => i.severity === 'error');
            if (blocking.length > 0) {
              throw badRequest(
                'Fix the errors before submitting',
                blocking.map((i) => ({ path: i.file, message: i.message })),
              );
            }
            const [updated] = await tx
              .update(drafts)
              .set({
                status: next,
                issues,
                baseVersion: live.bundle.version,
                submittedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(drafts.id, current.id))
              .returning();
            await record(tx, current.id, me, 'submitted');
            await ctx.emit(tx, 'authoring.submission.submitted', {
              submissionId: current.id,
              authorId: current.authorId,
              title: current.title,
            });
            return updated!;
          });
          return full(row);
        },
      );

      app.post(
        '/v1/studio/drafts/:id/withdraw',
        {
          schema: {
            tags: ['studio'],
            summary: 'Take a submission back to keep editing',
            security,
            params: idParams,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          const me = requireRole(req, 'writer');
          const row = await transition(req.params.id, 'withdraw', me, 'withdrawn');
          return full(row);
        },
      );

      // ---------- admin review ----------

      app.get(
        '/v1/admin/review/submissions',
        {
          schema: {
            tags: ['admin'],
            summary: 'Submissions to review (default: waiting for review)',
            security,
            querystring: authoring.DraftQuery,
            response: { 200: authoring.DraftPage, 401: Problem, 403: Problem },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          return listDrafts(
            req.query.status ? undefined : eq(drafts.status, 'in_review'),
            req.query,
          );
        },
      );

      app.get(
        '/v1/admin/review/submissions/:id',
        {
          schema: {
            tags: ['admin'],
            summary: 'One submission with its changes and history',
            security,
            params: idParams,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          return full(await load(req.params.id));
        },
      );

      app.post(
        '/v1/admin/review/submissions/:id/approve',
        {
          schema: {
            tags: ['admin'],
            summary: 'Approve and publish',
            description:
              'Re-validates against the live content (it may have changed since submission), then ' +
              'the content service publishes a new version. The draft becomes `published`, or goes ' +
              'back to `changes_requested` with the problems if publishing fails.',
            security,
            params: idParams,
            body: authoring.ReviewDecision,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const live = await liveContent(ctx);
          const row = await db.transaction(async (tx) => {
            const [current] = await tx
              .select()
              .from(drafts)
              .where(eq(drafts.id, req.params.id))
              .for('update');
            if (!current) throw notFound('Draft');
            const next = allow('approve', current, admin);
            const blocking = validateChanges(live.bundle, current.changes).filter(
              (i) => i.severity === 'error',
            );
            if (blocking.length > 0) {
              throw new HttpProblem(
                409,
                'stale-draft',
                'Conflict',
                'The live content changed and this submission no longer passes the checks; request changes instead',
                blocking.map((i) => ({ path: i.file, message: i.message })),
              );
            }
            const [updated] = await tx
              .update(drafts)
              .set({ status: next, updatedAt: new Date() })
              .where(eq(drafts.id, current.id))
              .returning();
            await record(tx, current.id, admin, 'approved', req.body.comment ?? null);
            await ctx.emit(tx, 'authoring.submission.approved', {
              submissionId: current.id,
              authorId: current.authorId,
              reviewerId: admin.id,
              title: current.title,
            });
            await audit(ctx, tx, admin, 'submission.approved', current.id, {
              title: current.title,
            });
            return updated!;
          });
          return full(row);
        },
      );

      app.post(
        '/v1/admin/review/submissions/:id/request-changes',
        {
          schema: {
            tags: ['admin'],
            summary: 'Send back to the writer with a comment',
            security,
            params: idParams,
            body: authoring.RequestChanges,
            response: { 200: authoring.Draft, ...errors },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const row = await transition(
            req.params.id,
            'request_changes',
            admin,
            'changes_requested',
            req.body.comment,
            async (tx, draft) => {
              await ctx.emit(tx, 'authoring.submission.rejected', {
                submissionId: draft.id,
                authorId: draft.authorId,
                reviewerId: admin.id,
                title: draft.title,
                comment: req.body.comment,
              });
              await audit(ctx, tx, admin, 'submission.changes_requested', draft.id, {
                title: draft.title,
              });
            },
          );
          return full(row);
        },
      );

      // ---------- internal ----------

      app.get(
        '/internal/submissions/:id',
        { schema: { hide: true, params: idParams } },
        async (req) => {
          requireInternal(req, config);
          const row = await load(req.params.id);
          return { id: row.id, title: row.title, authorId: row.authorId, changes: row.changes };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: idParams } },
        async (req) => {
          requireInternal(req, config);
          const rows = await db.select().from(drafts).where(eq(drafts.authorId, req.params.id));
          return { service: 'authoring', data: rows.map(toSummary) };
        },
      );

      /** A simple status change with a history entry, inside one locked transaction. */
      async function transition(
        id: string,
        action: DraftAction,
        actor: AuthUser,
        recorded: ActivityAction,
        comment: string | null = null,
        also?: (tx: Tx, draft: DraftRow) => Promise<void>,
      ): Promise<DraftRow> {
        return db.transaction(async (tx) => {
          const [current] = await tx.select().from(drafts).where(eq(drafts.id, id)).for('update');
          if (!current) throw notFound('Draft');
          const next = allow(action, current, actor);
          const [updated] = await tx
            .update(drafts)
            .set({ status: next, updatedAt: new Date() })
            .where(eq(drafts.id, id))
            .returning();
          await record(tx, id, actor, recorded, comment);
          await also?.(tx, current);
          return updated!;
        });
      }
    },
  };
}

async function audit(
  ctx: Ctx,
  tx: Tx,
  actor: AuthUser,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await ctx.emit(tx, 'audit.recorded', {
    actorId: actor.id,
    actorRole: actor.role,
    action,
    targetType: 'submission',
    targetId,
    details,
    at: new Date().toISOString(),
  });
}

/** Pulls the live bundle from the content service (claim check) into the read model. */
async function refreshSnapshot(ctx: Ctx) {
  const live = await internalFetch<{ versionId: string; number: number; bundle: ContentBundle }>(
    ctx.config,
    `${ctx.config.CONTENT_URL}/internal/content/bundle`,
  );
  await ctx.db
    .insert(snapshot)
    .values({ id: 1, ...live })
    .onConflictDoUpdate({
      target: snapshot.id,
      set: {
        versionId: live.versionId,
        number: live.number,
        bundle: live.bundle,
        updatedAt: new Date(),
      },
      // Events can arrive out of order; never go back to an older version.
      setWhere: sql`${snapshot.number} < excluded.number`,
    });
}

async function handle(ctx: Ctx, event: EventEnvelope) {
  if (event.type === 'content.version.published') await refreshSnapshot(ctx);

  await ctx.once('authoring', event, async (tx) => {
    if (event.type === 'content.version.published') {
      const { submissionId, number } = event.data as EventData<'content.version.published'>;
      if (!submissionId) return;
      const [draft] = await tx
        .select()
        .from(drafts)
        .where(eq(drafts.id, submissionId))
        .for('update');
      if (!draft || !decide('publish_succeeded', draft, null).ok) return;
      await tx
        .update(drafts)
        .set({ status: 'published', publishedVersion: number, issues: [], updatedAt: new Date() })
        .where(eq(drafts.id, draft.id));
      await record(tx, draft.id, null, 'published', `Live as version ${number}`);
    } else if (event.type === 'content.publish.failed') {
      const { submissionId, issues } = event.data as EventData<'content.publish.failed'>;
      const [draft] = await tx
        .select()
        .from(drafts)
        .where(eq(drafts.id, submissionId))
        .for('update');
      if (!draft || !decide('publish_failed', draft, null).ok) return;
      await tx
        .update(drafts)
        .set({
          status: 'changes_requested',
          issues: issues.map((i) => ({ ...i, severity: 'error' as const })),
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, draft.id));
      await record(
        tx,
        draft.id,
        null,
        'publish_failed',
        `Publishing failed: ${issues[0]?.message ?? 'unknown problem'}`,
      );
    } else if (event.type === 'privacy.deletion.requested') {
      // Published content stays (it belongs to the curriculum); the author's name does not.
      const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
      await tx
        .update(drafts)
        .set({ authorName: 'Former writer' })
        .where(eq(drafts.authorId, userId));
      await tx
        .update(activity)
        .set({ actorName: 'Former writer' })
        .where(eq(activity.actorId, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', { requestId, userId, service: 'authoring' });
    }
  });
}
