import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ContentBundle } from '@logicpath/content-schema';
import {
  applyToBundle,
  bundleToLoaded,
  checkContent,
  withVisuals,
} from '@logicpath/content-tools/browser';
import {
  authoring,
  content,
  Id,
  Problem,
  pub,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import {
  decodeCursor,
  encodeCursor,
  internalFetch,
  notFound,
  requireInternal,
  requireRole,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { current, versions } from './schema';

export const env = {
  AUTHORING_URL: z.url().default('http://127.0.0.1:4105'),
  /** JSON bundle imported as version 1 on first start (built from the YAML in content/). */
  SEED_BUNDLE_PATH: z.string().optional(),
};
export type ContentConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<ContentConfig>;
type Row = typeof versions.$inferSelect;

/** Serialised once per version: the bundle is large and every learner downloads it. */
interface Cached {
  id: string;
  number: number;
  checksum: string;
  json: string;
  bundle: ContentBundle;
  publishedAt: Date;
}

function seedPath(config: ContentConfig): string {
  const candidates = [
    config.SEED_BUNDLE_PATH,
    fileURLToPath(new URL('../assets/seed-bundle.json', import.meta.url)),
    fileURLToPath(new URL('../../../content/dist/bundle.json', import.meta.url)),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `no seed bundle found (tried ${candidates.join(', ')}); run "pnpm --filter @logicpath/content build"`,
    );
  }
  return found;
}

const toVersion = (row: Row, currentId: string | null): content.Version => ({
  id: row.id,
  number: row.number,
  checksum: row.checksum,
  note: row.note,
  submissionId: row.submissionId,
  publishedBy: row.publishedBy,
  publishedAt: row.publishedAt.toISOString(),
  current: row.id === currentId,
});

/** Writes a new version and makes it current; serialised so version numbers never collide. */
async function publish(
  ctx: Ctx,
  tx: Tx,
  bundle: ContentBundle,
  meta: { note: string; submissionId: string | null; publishedBy: string | null },
): Promise<Row> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('content.publish'))`);
  const [{ max }] = (await tx
    .select({ max: sql<number>`coalesce(max(${versions.number}), 0)` })
    .from(versions)) as [{ max: number }];
  const [row] = await tx
    .insert(versions)
    .values({ number: Number(max) + 1, checksum: bundle.version, bundle, ...meta })
    .returning();
  await tx
    .insert(current)
    .values({ id: 1, versionId: row!.id })
    .onConflictDoUpdate({ target: current.id, set: { versionId: row!.id } });
  await ctx.emit(tx, 'content.version.published', {
    versionId: row!.id,
    number: row!.number,
    checksum: row!.checksum,
    submissionId: meta.submissionId,
    publishedBy: meta.publishedBy,
  });
  return row!;
}

export function contentService(config: ContentConfig): ServiceDefinition<ContentConfig> {
  let cache: Cached | null = null;

  /** The current version, reloaded only when another replica (or a publish) moved the pointer. */
  async function currentVersion(ctx: Ctx): Promise<Cached> {
    const [pointer] = await ctx.db.select().from(current).where(eq(current.id, 1));
    if (!pointer) throw notFound('Published content');
    if (cache?.id === pointer.versionId) return cache;
    const [row] = await ctx.db.select().from(versions).where(eq(versions.id, pointer.versionId));
    cache = {
      id: row!.id,
      number: row!.number,
      checksum: row!.checksum,
      json: JSON.stringify(row!.bundle),
      bundle: row!.bundle,
      publishedAt: row!.publishedAt,
    };
    return cache;
  }

  return {
    title: 'LogicPath Content',
    description:
      'The published curriculum: one versioned bundle with every stage, concept, lesson, question ' +
      'and misconception, plus precomputed visualizer frames. Admins can list and restore versions.',
    config,
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),

    onStart: async (ctx) => {
      await ctx.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('content.seed'))`);
        const [existing] = await tx.select({ id: versions.id }).from(versions).limit(1);
        if (existing) return;
        const path = seedPath(config);
        const seed = JSON.parse(readFileSync(path, 'utf8')) as ContentBundle;
        const errors = checkContent(bundleToLoaded(seed)).filter((i) => i.severity === 'error');
        if (errors.length > 0) {
          throw new Error(
            `seed bundle ${path} is invalid: ${errors[0]!.file}: ${errors[0]!.message}`,
          );
        }
        await publish(ctx, tx, withVisuals(seed), {
          note: 'Initial curriculum from the content repository',
          submissionId: null,
          publishedBy: null,
        });
        ctx.log.info({ path }, 'imported seed curriculum as version 1');
      });
    },

    consumers: (ctx) => [
      {
        name: 'content-publisher',
        types: ['authoring.submission.approved'],
        handle: (event) => handleApproved(ctx, event),
      },
    ],

    routes: (app, ctx) => {
      const { db } = ctx;

      app.get(
        '/v1/content/bundle',
        {
          schema: {
            tags: ['content'],
            summary: 'The published curriculum',
            description:
              'Public, no sign-in needed. Send the last ETag in `If-None-Match` to get `304 Not ' +
              'Modified` when nothing changed. Mobile apps cache it for offline use.',
            response: { 200: content.Bundle, 304: z.null() },
          },
        },
        async (req, reply) => {
          const version = await currentVersion(ctx);
          const etag = `"${version.checksum}-${version.number}"`;
          void reply.header('etag', etag).header('cache-control', 'no-cache');
          if (req.headers['if-none-match'] === etag) return reply.status(304).send(null);
          // A JSON string is sent as is (no re-serialisation of the big bundle).
          return reply.type('application/json').send(version.json as never);
        },
      );

      app.get(
        '/v1/content/manifest',
        {
          schema: {
            tags: ['content'],
            summary: 'Which curriculum version is live (small; poll this, not the bundle)',
            response: { 200: content.Manifest },
          },
        },
        async () => {
          const version = await currentVersion(ctx);
          return {
            versionId: version.id,
            number: version.number,
            checksum: version.checksum,
            publishedAt: version.publishedAt.toISOString(),
            concepts: version.bundle.concepts.filter((c) => c.published).length,
            items: Object.keys(version.bundle.items).length,
          };
        },
      );

      // ---------- the public API for outside developers (the gateway checks the API key) ----------

      const publicConcept = (c: ContentBundle['concepts'][number]): pub.PublicConcept => ({
        id: c.id,
        stage: c.stage,
        title: c.title,
        prerequisites: [...c.prerequisites],
        published: c.published,
      });

      app.get(
        '/public/v1/curriculum',
        {
          schema: {
            tags: ['public'],
            summary: 'Stages and concepts',
            description: 'Needs an `X-API-Key` header. Read-only; answers are never included.',
            security: [{ apiKey: [] }],
            response: { 200: pub.PublicCurriculum },
          },
        },
        async () => {
          const { bundle } = await currentVersion(ctx);
          return {
            version: bundle.version,
            stages: bundle.stages.map((s) => ({ id: s.id, title: s.title })),
            concepts: bundle.concepts.map(publicConcept),
          };
        },
      );

      app.get(
        '/public/v1/concepts/:id',
        {
          schema: {
            tags: ['public'],
            summary: 'One concept and its lesson',
            security: [{ apiKey: [] }],
            params: z.object({ id: z.string() }),
            response: { 200: pub.PublicLesson, 404: Problem },
          },
        },
        async (req) => {
          const { bundle } = await currentVersion(ctx);
          const concept = bundle.concepts.find((c) => c.id === req.params.id);
          const lesson = bundle.lessons[req.params.id];
          if (!concept || !lesson) throw notFound('Concept');
          return {
            concept: publicConcept(concept),
            minutes: lesson.minutes,
            story: { title: lesson.story.title, body: lesson.story.body },
            code: lesson.see.code,
            recap: lesson.recap,
            itemCount: Object.values(bundle.items).filter((i) => i.concept === concept.id).length,
          };
        },
      );

      app.get(
        '/public/v1/items',
        {
          schema: {
            tags: ['public'],
            summary: 'Questions for a concept (no answers)',
            security: [{ apiKey: [] }],
            querystring: z.object({ concept: z.string() }),
            response: { 200: pub.PublicItemList, 404: Problem },
          },
        },
        async (req) => {
          const { bundle } = await currentVersion(ctx);
          if (!bundle.concepts.some((c) => c.id === req.query.concept)) throw notFound('Concept');
          return {
            items: Object.values(bundle.items)
              .filter((i) => i.concept === req.query.concept)
              .map((i) => ({
                id: i.id,
                conceptId: i.concept,
                type: i.type,
                difficulty: i.difficulty,
                prompt: i.prompt,
                code: 'code' in i && typeof i.code === 'string' ? i.code : null,
              })),
          };
        },
      );

      app.get(
        '/v1/admin/content/versions',
        {
          schema: {
            tags: ['admin'],
            summary: 'Published curriculum versions, newest first',
            security: [{ bearer: [] }],
            querystring: z.object({
              cursor: z.string().optional(),
              limit: z.coerce.number().int().min(1).max(100).default(20),
            }),
            response: { 200: content.VersionPage, 401: Problem, 403: Problem },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const { limit } = req.query;
          const cursor = decodeCursor<{ n: number }>(req.query.cursor);
          const [pointer] = await db.select().from(current).where(eq(current.id, 1));
          const rows = await db
            .select()
            .from(versions)
            .where(cursor ? lt(versions.number, cursor.n) : undefined)
            .orderBy(desc(versions.number))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          return {
            items: page.map((r) => toVersion(r, pointer?.versionId ?? null)),
            nextCursor: rows.length > limit ? encodeCursor({ n: page.at(-1)!.number }) : null,
          };
        },
      );

      app.post(
        '/v1/admin/content/versions/:id/rollback',
        {
          schema: {
            tags: ['admin'],
            summary: 'Restore an earlier version',
            description:
              'Publishes a copy of that version as a new version number, so clients always see ' +
              'numbers go up and the history keeps what happened.',
            security: [{ bearer: [] }],
            params: z.object({ id: Id }),
            body: content.RollbackRequest,
            response: { 200: content.Version, 401: Problem, 403: Problem, 404: Problem },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const [source] = await db.select().from(versions).where(eq(versions.id, req.params.id));
          if (!source) throw notFound('Version');
          const row = await db.transaction(async (tx) => {
            const created = await publish(ctx, tx, source.bundle, {
              note: req.body.note ?? `Restored version ${source.number}`,
              submissionId: null,
              publishedBy: admin.id,
            });
            await ctx.emit(tx, 'audit.recorded', {
              actorId: admin.id,
              actorRole: admin.role,
              action: 'content.rollback',
              targetType: 'content-version',
              targetId: created.id,
              details: { restored: source.number, as: created.number },
              at: new Date().toISOString(),
            });
            return created;
          });
          return toVersion(row, row.id);
        },
      );

      app.get('/internal/content/bundle', { schema: { hide: true } }, async (req) => {
        requireInternal(req, config);
        const version = await currentVersion(ctx);
        return { versionId: version.id, number: version.number, bundle: version.bundle };
      });
    },
  };
}

/**
 * Publish saga, step 2: an admin approved a submission. Fetch its changes (claim check: events
 * stay small), apply them to the live curriculum, run every content check, then publish a new
 * version or report why not. Authoring listens for either outcome.
 */
async function handleApproved(ctx: Ctx, event: EventEnvelope) {
  const { submissionId, reviewerId } = event.data as EventData<'authoring.submission.approved'>;
  const submission = authoring.Submission.parse(
    await internalFetch(
      ctx.config,
      `${ctx.config.AUTHORING_URL}/internal/submissions/${submissionId}`,
    ),
  );
  await ctx.once('content-publisher', event, async (tx) => {
    const [pointer] = await tx.select().from(current).where(eq(current.id, 1));
    const [live] = await tx.select().from(versions).where(eq(versions.id, pointer!.versionId));
    let next: ContentBundle;
    let errors: { file: string; message: string }[];
    try {
      next = applyToBundle(live!.bundle, submission.changes);
      errors = checkContent(bundleToLoaded(next))
        .filter((i) => i.severity === 'error')
        .map(({ file, message }) => ({ file, message }));
    } catch (error) {
      next = live!.bundle;
      errors = [{ file: '-', message: `could not apply the changes: ${String(error)}` }];
    }
    if (errors.length > 0) {
      await ctx.emit(tx, 'content.publish.failed', { submissionId, issues: errors.slice(0, 50) });
      return;
    }
    await publish(ctx, tx, withVisuals(next), {
      note: submission.title,
      submissionId,
      publishedBy: reviewerId,
    });
  });
}
