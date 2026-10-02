import { Ok, Problem, platform } from '@logicpath/contracts';
import { DEFAULT_FLAGS, evaluateAll } from '@logicpath/flags-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  badRequest,
  notFound,
  problems,
  requireRole,
  type ServiceContext,
  type ServiceDefinition,
} from '@logicpath/service-kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { flags } from './schema';

export const env = {
  /** How long a replica may keep serving the flags it already loaded. */
  FLAGS_CACHE_SECONDS: z.coerce.number().int().min(0).default(5),
};
export type FlagsConfig = ReturnType<typeof loadConfig<typeof env>>;

type Row = typeof flags.$inferSelect;

const KEY = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;

const toFlag = (row: Row): platform.Flag => ({
  key: row.key,
  description: row.description,
  enabled: row.enabled,
  rolloutPercent: row.rolloutPercent,
  roles: row.roles,
  platforms: row.platforms,
  minAppVersion: row.minAppVersion,
  value: row.value ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Feature flags and remote config. The rules (who gets a flag) are the shared `flags-rules`
 * package, so the web app, the Android app and this service give the same answer.
 */
export function flagsService(config: FlagsConfig): ServiceDefinition<FlagsConfig> {
  let cached: { at: number; rows: Row[] } | null = null;

  async function load(ctx: ServiceContext<FlagsConfig>): Promise<Row[]> {
    const ttl = config.FLAGS_CACHE_SECONDS * 1000;
    if (cached && Date.now() - cached.at < ttl) return cached.rows;
    const rows = await ctx.db.select().from(flags);
    cached = { at: Date.now(), rows };
    return rows;
  }

  return {
    title: 'LogicPath Flags',
    description: 'Feature flags and remote configuration, with gradual rollouts.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    onStart: async (ctx) => {
      // A fresh installation starts with the standard flags; after that admins own the list.
      const [any] = await ctx.db.select({ key: flags.key }).from(flags).limit(1);
      if (any) return;
      await ctx.db
        .insert(flags)
        .values(
          DEFAULT_FLAGS.map((flag) => ({
            ...flag,
            roles: [...flag.roles],
            platforms: [...flag.platforms],
          })),
        )
        .onConflictDoNothing();
    },
    routes: (app, ctx) => {
      const { db } = ctx;

      app.get(
        '/v1/flags',
        {
          schema: {
            tags: ['flags'],
            summary: 'Which flags are on for me, with their remote-config values',
            description:
              'Works signed out too (rollouts then use no user id). Roles and rollouts apply to the signed-in user.',
            querystring: platform.FlagsQuery,
            response: { 200: platform.EvaluatedFlags, 400: Problem },
          },
        },
        async (req) => {
          const rows = await load(ctx);
          return {
            flags: evaluateAll(rows.map(toFlag), {
              userId: req.user?.id ?? null,
              role: req.user?.role ?? null,
              platform: req.query.platform,
              appVersion: req.query.appVersion ?? null,
            }),
          };
        },
      );

      app.get(
        '/v1/admin/flags',
        {
          schema: {
            tags: ['flags'],
            summary: 'Every flag, for the admin screen',
            security: [{ bearer: [] }],
            response: { 200: platform.FlagList, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const rows = await db.select().from(flags).orderBy(flags.key);
          return { items: rows.map(toFlag) };
        },
      );

      app.put(
        '/v1/admin/flags/:key',
        {
          schema: {
            tags: ['flags'],
            summary: 'Create or change a flag',
            security: [{ bearer: [] }],
            params: z.object({ key: z.string() }),
            body: platform.FlagChange,
            response: { 200: platform.Flag, ...problems },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const { key } = req.params;
          if (!KEY.test(key)) {
            throw badRequest('A flag key is lower-case words joined by dots, e.g. "beta.new-map"');
          }
          const row = await db.transaction(async (tx) => {
            const [before] = await tx.select().from(flags).where(eq(flags.key, key));
            const values = { ...req.body, value: req.body.value ?? null, updatedAt: new Date() };
            const [saved] = await tx
              .insert(flags)
              .values({ key, ...values })
              .onConflictDoUpdate({ target: flags.key, set: values })
              .returning();
            await ctx.emit(tx, 'flags.changed', { key, enabled: saved!.enabled });
            await ctx.emit(tx, 'audit.recorded', {
              actorId: admin.id,
              actorRole: admin.role,
              action: before ? 'flag.updated' : 'flag.created',
              targetType: 'flag',
              targetId: key,
              details: { enabled: saved!.enabled, rolloutPercent: saved!.rolloutPercent },
              at: new Date().toISOString(),
            });
            return saved!;
          });
          cached = null;
          return toFlag(row);
        },
      );

      app.delete(
        '/v1/admin/flags/:key',
        {
          schema: {
            tags: ['flags'],
            summary: 'Remove a flag',
            security: [{ bearer: [] }],
            params: z.object({ key: z.string() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const { key } = req.params;
          await db.transaction(async (tx) => {
            const [gone] = await tx.delete(flags).where(eq(flags.key, key)).returning();
            if (!gone) throw notFound('Flag');
            await ctx.emit(tx, 'flags.changed', { key, enabled: false });
            await ctx.emit(tx, 'audit.recorded', {
              actorId: admin.id,
              actorRole: admin.role,
              action: 'flag.deleted',
              targetType: 'flag',
              targetId: key,
              details: {},
              at: new Date().toISOString(),
            });
          });
          cached = null;
          return { ok: true as const };
        },
      );
    },
  };
}
