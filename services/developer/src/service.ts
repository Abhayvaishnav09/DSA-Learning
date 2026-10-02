import { createHash, randomBytes } from 'node:crypto';
import { Ok, PageQuery, platform, type EventData, type EventEnvelope } from '@logicpath/contracts';
import { addDays, istDate } from '@logicpath/gamification-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  conflict,
  decodeCursor,
  encodeCursor,
  forbidden,
  notFound,
  problems,
  requireInternal,
  requireRole,
  requireUser,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiKeys, owners, usage } from './schema';

export const env = {};
export type DeveloperConfig = ReturnType<typeof loadConfig<typeof env>>;

type Key = typeof apiKeys.$inferSelect;

const ADULT_AGE = 18;
const MAX_ACTIVE_KEYS = 5;
const QUOTAS = { free: 1_000, partner: 50_000 } as const;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const newSecret = () => `lp_live_${randomBytes(24).toString('base64url')}`;

export function developerService(config: DeveloperConfig): ServiceDefinition<DeveloperConfig> {
  const toKey = (row: Key, usageToday: number): platform.ApiKey => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    plan: row.plan,
    dailyQuota: row.dailyQuota,
    usageToday,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  });

  return {
    title: 'LogicPath Developer Platform',
    description: 'API keys and usage for the public curriculum API.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'developer',
        types: ['identity.user.registered', 'privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      const { db } = ctx;

      /** Today's request count for each of these keys. */
      async function usageToday(
        keys: readonly Key[],
        now = new Date(),
      ): Promise<Map<string, number>> {
        if (keys.length === 0) return new Map();
        const rows = await db
          .select({ keyId: usage.keyId, requests: usage.requests })
          .from(usage)
          .where(
            and(
              inArray(
                usage.keyId,
                keys.map((k) => k.id),
              ),
              eq(usage.day, istDate(now)),
            ),
          );
        return new Map(rows.map((r) => [r.keyId, r.requests]));
      }

      async function view(rows: readonly Key[]): Promise<platform.ApiKey[]> {
        const today = await usageToday(rows);
        return rows.map((row) => toKey(row, today.get(row.id) ?? 0));
      }

      async function mine(userId: string, id: string): Promise<Key> {
        const [row] = await db
          .select()
          .from(apiKeys)
          .where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, userId)));
        if (!row) throw notFound('API key');
        return row;
      }

      app.get(
        '/v1/developer/keys',
        {
          schema: {
            tags: ['developer'],
            summary: 'My API keys',
            security: [{ bearer: [] }],
            response: { 200: platform.ApiKeyList, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const rows = await db
            .select()
            .from(apiKeys)
            .where(eq(apiKeys.ownerId, me.id))
            .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
          return { items: await view(rows) };
        },
      );

      app.post(
        '/v1/developer/keys',
        {
          schema: {
            tags: ['developer'],
            summary: 'Create an API key',
            description:
              'The full key is in the response once. Only people aged 18 or over can have keys.',
            security: [{ bearer: [] }],
            body: platform.CreateApiKey,
            response: { 201: platform.CreatedApiKey, ...problems },
          },
        },
        async (req, reply) => {
          const me = requireUser(req);
          const [owner] = await db.select().from(owners).where(eq(owners.userId, me.id));
          if (!owner) throw forbidden('We could not confirm your age yet. Try again in a minute.');
          // The API terms are a contract: only adults can accept them.
          if (new Date().getUTCFullYear() - owner.birthYear < ADULT_AGE) {
            throw forbidden('API keys are for people aged 18 or over');
          }
          const secret = newSecret();
          const row = await db.transaction(async (tx) => {
            // Serialise one person's key creation, so the limit cannot be passed by two at once.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`keys:${me.id}`}))`);
            const [{ active }] = (await tx
              .select({ active: count() })
              .from(apiKeys)
              .where(and(eq(apiKeys.ownerId, me.id), isNull(apiKeys.revokedAt)))) as [
              { active: number },
            ];
            if (active >= MAX_ACTIVE_KEYS) {
              throw conflict(
                `You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`,
              );
            }
            const [created] = await tx
              .insert(apiKeys)
              .values({
                name: req.body.name,
                prefix: secret.slice(0, 16),
                secretHash: sha256(secret),
                scopes: req.body.scopes,
                plan: 'free',
                dailyQuota: QUOTAS.free,
                ownerId: me.id,
              })
              .returning();
            await ctx.emit(tx, 'developer.key.created', {
              keyId: created!.id,
              ownerId: me.id,
              prefix: created!.prefix,
            });
            await audit(tx, me, 'apikey.created', created!.id, { name: created!.name });
            return created!;
          });
          return reply.status(201).send({ ...toKey(row, 0), secret });
        },
      );

      app.delete(
        '/v1/developer/keys/:id',
        {
          schema: {
            tags: ['developer'],
            summary: 'Revoke one of my keys',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const row = await mine(me.id, req.params.id);
          await revoke(row, me, {});
          return { ok: true as const };
        },
      );

      app.get(
        '/v1/developer/keys/:id/usage',
        {
          schema: {
            tags: ['developer'],
            summary: 'Requests per day for one of my keys (last 14 days)',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: platform.ApiKeyUsage, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const row = await mine(me.id, req.params.id);
          const today = istDate(new Date());
          const from = addDays(today, -13);
          const rows = await db
            .select({ day: usage.day, requests: usage.requests })
            .from(usage)
            .where(and(eq(usage.keyId, row.id), sql`${usage.day} >= ${from}`));
          const byDay = new Map(rows.map((r) => [r.day, r.requests]));
          return {
            days: Array.from({ length: 14 }, (_, i) => {
              const date = addDays(today, i - 13);
              return { date, requests: byDay.get(date) ?? 0 };
            }),
          };
        },
      );

      // ---------- admin ----------

      app.get(
        '/v1/admin/api-keys',
        {
          schema: {
            tags: ['developer'],
            summary: 'Every API key',
            security: [{ bearer: [] }],
            querystring: PageQuery,
            response: { 200: platform.ApiKeyPage, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const { limit } = req.query;
          const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
          const rows = await db
            .select()
            .from(apiKeys)
            .where(
              cursor
                ? or(
                    lt(apiKeys.createdAt, new Date(cursor.c)),
                    and(eq(apiKeys.createdAt, new Date(cursor.c)), lt(apiKeys.id, cursor.id)),
                  )
                : undefined,
            )
            .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return {
            items: await view(page),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
                : null,
          };
        },
      );

      app.patch(
        '/v1/admin/api-keys/:id',
        {
          schema: {
            tags: ['developer'],
            summary: 'Change a key’s plan or daily quota',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            body: platform.AdminApiKeyUpdate,
            response: { 200: platform.ApiKey, ...problems },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const change = req.body;
          const row = await db.transaction(async (tx) => {
            const [before] = await tx
              .select()
              .from(apiKeys)
              .where(eq(apiKeys.id, req.params.id))
              .for('update');
            if (!before) throw notFound('API key');
            // A plan change resets to that plan's quota unless the admin sets one too.
            const set = change.plan
              ? { plan: change.plan, dailyQuota: change.dailyQuota ?? QUOTAS[change.plan] }
              : change.dailyQuota !== undefined
                ? { dailyQuota: change.dailyQuota }
                : {};
            const [after] = Object.keys(set).length
              ? await tx.update(apiKeys).set(set).where(eq(apiKeys.id, before.id)).returning()
              : [before];
            await audit(tx, admin, 'apikey.updated', before.id, change);
            return after!;
          });
          return (await view([row]))[0]!;
        },
      );

      app.post(
        '/v1/admin/api-keys/:id/revoke',
        {
          schema: {
            tags: ['developer'],
            summary: 'Revoke any key',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, req.params.id));
          if (!row) throw notFound('API key');
          await revoke(row, admin, { by: 'admin' });
          return { ok: true as const };
        },
      );

      // ---------- used by the gateway ----------

      app.post(
        '/internal/keys/verify',
        {
          schema: {
            hide: true,
            body: z.object({ secret: z.string().min(10).max(200), scope: z.string().optional() }),
          },
        },
        async (req) => {
          requireInternal(req, config);
          const [row] = await db
            .select()
            .from(apiKeys)
            .where(eq(apiKeys.secretHash, sha256(req.body.secret)));
          if (!row || row.revokedAt) return { valid: false as const };
          const scopeOk = !req.body.scope || (row.scopes as string[]).includes(req.body.scope);
          if (!scopeOk) return { valid: false as const };
          if (row.dailyQuota <= 0) {
            return {
              valid: true as const,
              allowed: false,
              keyId: row.id,
              ownerId: row.ownerId,
              plan: row.plan,
              dailyQuota: row.dailyQuota,
              requestsToday: 0,
            };
          }
          // Count the request and refuse it once the day's quota is spent, in one statement.
          const day = istDate(new Date());
          const counted = await db.execute(sql`
            INSERT INTO api_key_usage (key_id, day, requests) VALUES (${row.id}, ${day}, 1)
            ON CONFLICT (key_id, day) DO UPDATE SET requests = api_key_usage.requests + 1
              WHERE api_key_usage.requests < ${row.dailyQuota}
            RETURNING requests`);
          const allowed = counted.rows.length > 0;
          if (allowed) {
            await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
          }
          return {
            valid: true as const,
            allowed,
            keyId: row.id,
            ownerId: row.ownerId,
            plan: row.plan,
            dailyQuota: row.dailyQuota,
            requestsToday: allowed
              ? Number((counted.rows[0] as { requests: number }).requests)
              : row.dailyQuota,
          };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const rows = await db.select().from(apiKeys).where(eq(apiKeys.ownerId, req.params.id));
          return { service: 'developer', data: { keys: await view(rows) } };
        },
      );

      async function revoke(
        row: Key,
        actor: { id: string; role: 'student' | 'writer' | 'admin' },
        details: Record<string, unknown>,
      ) {
        if (row.revokedAt) return;
        await db.transaction(async (tx) => {
          await tx.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, row.id));
          await ctx.emit(tx, 'developer.key.revoked', {
            keyId: row.id,
            ownerId: row.ownerId,
            prefix: row.prefix,
          });
          await audit(tx, actor, 'apikey.revoked', row.id, details);
        });
      }

      function audit(
        tx: Tx,
        actor: { id: string; role: 'student' | 'writer' | 'admin' },
        action: string,
        targetId: string,
        details: Record<string, unknown>,
      ) {
        return ctx.emit(tx, 'audit.recorded', {
          actorId: actor.id,
          actorRole: actor.role,
          action,
          targetType: 'api_key',
          targetId,
          details,
          at: new Date().toISOString(),
        });
      }
    },
  };
}

async function handle(ctx: ServiceContext<DeveloperConfig>, event: EventEnvelope) {
  await ctx.once('developer', event, async (tx) => {
    if (event.type === 'identity.user.registered') {
      const data = event.data as EventData<'identity.user.registered'>;
      await tx
        .insert(owners)
        .values({ userId: data.userId, birthYear: data.birthYear })
        .onConflictDoUpdate({ target: owners.userId, set: { birthYear: data.birthYear } });
    } else if (event.type === 'privacy.deletion.requested') {
      const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
      await tx.delete(apiKeys).where(eq(apiKeys.ownerId, userId));
      await tx.delete(owners).where(eq(owners.userId, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', {
        requestId,
        userId,
        service: 'developer',
      });
    }
  });
}
