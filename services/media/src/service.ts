import multipart from '@fastify/multipart';
import {
  Ok,
  PageQuery,
  platform,
  Problem,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import {
  decodeCursor,
  encodeCursor,
  badRequest,
  forbidden,
  HttpProblem,
  notFound,
  problems,
  requireInternal,
  requireRole,
  type ServiceContext,
  type ServiceDefinition,
} from '@logicpath/service-kit';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import sharp, { type Metadata } from 'sharp';
import { z } from 'zod';
import { assets, variants } from './schema';

export const env = {
  /** Where browsers reach the API (the gateway). Picture links in responses start with it. */
  PUBLIC_API_URL: z.url().default('http://localhost:8080'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(5),
};
export type MediaConfig = ReturnType<typeof loadConfig<typeof env>>;

type Asset = typeof assets.$inferSelect;
type VariantName = (typeof platform.MEDIA_VARIANTS)[number];

const WIDTHS: Record<VariantName, number> = { w320: 320, w640: 640, w1280: 1280 };
/** Decoded pictures are limited too, so a tiny file that unpacks into a huge image is refused. */
const MAX_PIXELS = 40_000_000;
const FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);
/** Nobody: pictures stay in lessons after the person who uploaded them is forgotten. */
const NOBODY = '00000000-0000-0000-0000-000000000000';

const unsupported = () =>
  new HttpProblem(415, 'media-type', 'Unsupported file', 'Use a PNG, JPEG, WebP or GIF picture');

export function mediaService(config: MediaConfig): ServiceDefinition<MediaConfig> {
  const base = config.PUBLIC_API_URL.replace(/\/$/, '');
  const toAsset = (row: Asset): platform.MediaAsset => ({
    id: row.id,
    filename: row.filename,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    alt: row.alt,
    blurDataUrl: row.blurDataUrl,
    urls: {
      w320: `${base}/media/${row.id}/w320`,
      w640: `${base}/media/${row.id}/w640`,
      w1280: `${base}/media/${row.id}/w1280`,
    },
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  });

  return {
    title: 'LogicPath Media',
    description: 'The image library for lessons: upload once, served at three widths.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'media',
        types: ['privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: async (app, ctx) => {
      const { db } = ctx;
      await app.register(multipart, {
        limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 4, parts: 6 },
      });

      app.post(
        '/v1/studio/media',
        {
          schema: {
            tags: ['media'],
            summary: 'Upload an image (multipart: file, alt)',
            description:
              'Send `multipart/form-data` with a `file` (PNG, JPEG, WebP or GIF, up to the size limit) and `alt`, a short description for people who cannot see the picture.',
            consumes: ['multipart/form-data'],
            security: [{ bearer: [] }],
            response: { 201: platform.MediaAsset, ...problems, 413: Problem, 415: Problem },
          },
        },
        async (req, reply) => {
          const user = requireRole(req, 'writer');
          let file: { buffer: Buffer; filename: string } | null = null;
          let alt = '';
          for await (const part of req.parts()) {
            if (part.type === 'file') {
              const buffer = await part.toBuffer();
              if (part.fieldname === 'file') file = { buffer, filename: part.filename };
            } else if (part.fieldname === 'alt') {
              alt = String(part.value ?? '').trim();
            }
          }
          if (!file || file.buffer.length === 0) throw badRequest('Choose a picture to upload');
          if (alt.length < 3) throw badRequest('Describe the picture in a few words (alt text)');

          const processed = await process(file.buffer);
          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(assets)
              .values({
                filename: file.filename || 'picture',
                width: processed.width,
                height: processed.height,
                bytes: file.buffer.length,
                alt,
                blurDataUrl: processed.blur,
                uploadedBy: user.id,
              })
              .returning();
            await tx.insert(variants).values(
              processed.variants.map((v) => ({
                assetId: created!.id,
                name: v.name,
                contentType: 'image/webp',
                width: v.width,
                data: v.data,
              })),
            );
            await ctx.emit(tx, 'media.asset.created', {
              assetId: created!.id,
              uploadedBy: user.id,
            });
            await ctx.emit(tx, 'audit.recorded', {
              actorId: user.id,
              actorRole: user.role,
              action: 'media.uploaded',
              targetType: 'media',
              targetId: created!.id,
              details: { filename: created!.filename },
              at: new Date().toISOString(),
            });
            return created!;
          });
          return reply.status(201).send(toAsset(row));
        },
      );

      app.get(
        '/v1/studio/media',
        {
          schema: {
            tags: ['media'],
            summary: 'The image library, newest first',
            security: [{ bearer: [] }],
            querystring: PageQuery,
            response: { 200: platform.MediaPage, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'writer');
          const { limit } = req.query;
          const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
          const rows = await db
            .select()
            .from(assets)
            .where(
              cursor
                ? or(
                    lt(assets.createdAt, new Date(cursor.c)),
                    and(eq(assets.createdAt, new Date(cursor.c)), lt(assets.id, cursor.id)),
                  )
                : undefined,
            )
            .orderBy(desc(assets.createdAt), desc(assets.id))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return {
            items: page.map(toAsset),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
                : null,
          };
        },
      );

      app.delete(
        '/v1/studio/media/:id',
        {
          schema: {
            tags: ['media'],
            summary: 'Delete a picture (its uploader or an admin)',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const user = requireRole(req, 'writer');
          await db.transaction(async (tx) => {
            const [row] = await tx
              .select()
              .from(assets)
              .where(eq(assets.id, req.params.id))
              .for('update');
            if (!row) throw notFound('Picture');
            if (row.uploadedBy !== user.id && user.role !== 'admin') {
              throw forbidden('Only the person who uploaded a picture, or an admin, can delete it');
            }
            await tx.delete(assets).where(eq(assets.id, row.id));
            await ctx.emit(tx, 'media.asset.deleted', { assetId: row.id });
            await ctx.emit(tx, 'audit.recorded', {
              actorId: user.id,
              actorRole: user.role,
              action: 'media.deleted',
              targetType: 'media',
              targetId: row.id,
              details: { filename: row.filename },
              at: new Date().toISOString(),
            });
          });
          return { ok: true as const };
        },
      );

      // The pictures themselves. Not part of the documented JSON API; any browser can load them.
      app.get(
        '/media/:id/:variant',
        {
          schema: {
            hide: true,
            params: z.object({ id: z.uuid(), variant: z.string() }),
          },
        },
        async (req, reply) => {
          const name = req.params.variant.replace(/\.webp$/, '');
          if (!(platform.MEDIA_VARIANTS as readonly string[]).includes(name)) {
            throw notFound('Picture');
          }
          const [row] = await db
            .select({ data: variants.data, contentType: variants.contentType })
            .from(variants)
            .where(
              and(eq(variants.assetId, req.params.id), eq(variants.name, name as VariantName)),
            );
          if (!row) throw notFound('Picture');
          const etag = `"${req.params.id}-${name}"`;
          reply.header('etag', etag);
          reply.header('cache-control', 'public, max-age=31536000, immutable');
          reply.header('cross-origin-resource-policy', 'cross-origin');
          reply.header('x-content-type-options', 'nosniff');
          if (req.headers['if-none-match'] === etag) return reply.status(304).send();
          return reply.type(row.contentType).send(row.data);
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const rows = await db.select().from(assets).where(eq(assets.uploadedBy, req.params.id));
          return { service: 'media', data: { uploads: rows.map(toAsset) } };
        },
      );
    },
  };
}

interface Processed {
  width: number;
  height: number;
  blur: string;
  variants: { name: VariantName; width: number; data: Buffer }[];
}

/** Reads the picture, turns it, strips what a camera recorded about it, and makes each width. */
async function process(input: Buffer): Promise<Processed> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw badRequest('That file could not be read as a picture');
  }
  if (!meta.format || !FORMATS.has(meta.format)) throw unsupported();
  if (!meta.width || !meta.height) throw badRequest('That file could not be read as a picture');
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  try {
    const make = (target: number, quality: number) =>
      sharp(input, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .resize({ width: Math.min(target, width), withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
    const made = await Promise.all(
      (Object.keys(WIDTHS) as VariantName[]).map(async (name) => {
        const { data, info } = await make(WIDTHS[name], 82);
        return { name, width: info.width, data };
      }),
    );
    const tiny = await make(16, 30);
    return {
      width,
      height,
      blur: `data:image/webp;base64,${tiny.data.toString('base64')}`,
      variants: made,
    };
  } catch {
    throw badRequest('That file could not be read as a picture');
  }
}

async function handle(ctx: ServiceContext<MediaConfig>, event: EventEnvelope) {
  await ctx.once('media', event, async (tx) => {
    if (event.type === 'privacy.deletion.requested') {
      const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
      await tx.update(assets).set({ uploadedBy: NOBODY }).where(eq(assets.uploadedBy, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', { requestId, userId, service: 'media' });
    }
  });
}
