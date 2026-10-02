import { platform, type EventData, type EventEnvelope } from '@logicpath/contracts';
import {
  decodeCursor,
  encodeCursor,
  problems,
  requireInternal,
  requireRole,
  type ServiceContext,
  type ServiceDefinition,
} from '@logicpath/service-kit';
import type { loadConfig } from '@logicpath/service-kit';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { auditLog } from './schema';

export const env = {};
export type AuditConfig = ReturnType<typeof loadConfig<typeof env>>;

type Row = typeof auditLog.$inferSelect;

const toEntry = (row: Row): platform.AuditEntry => ({
  id: row.id,
  actorId: row.actorId,
  actorRole: row.actorRole,
  action: row.action,
  targetType: row.targetType,
  targetId: row.targetId,
  details: row.details,
  at: row.at.toISOString(),
});

/**
 * The audit trail: every service announces privileged actions as `audit.recorded`, and this
 * service keeps them, so an admin can answer "who did what, and when" in one place.
 */
export function auditService(config: AuditConfig): ServiceDefinition<AuditConfig> {
  return {
    title: 'LogicPath Audit',
    description: 'The record of privileged actions: who changed what, and when.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'audit',
        types: ['audit.recorded', 'privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      app.get(
        '/v1/admin/audit',
        {
          schema: {
            tags: ['audit'],
            summary: 'The audit trail, newest first',
            security: [{ bearer: [] }],
            querystring: platform.AuditQuery,
            response: { 200: platform.AuditPage, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const { actorId, action, targetType, limit } = req.query;
          const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
          const filters = [
            actorId ? eq(auditLog.actorId, actorId) : undefined,
            action ? eq(auditLog.action, action) : undefined,
            targetType ? eq(auditLog.targetType, targetType) : undefined,
            cursor
              ? or(
                  lt(auditLog.at, new Date(cursor.c)),
                  and(eq(auditLog.at, new Date(cursor.c)), lt(auditLog.id, cursor.id)),
                )
              : undefined,
          ].filter((f) => f !== undefined);
          const rows = await ctx.db
            .select()
            .from(auditLog)
            .where(filters.length ? and(...filters) : undefined)
            .orderBy(desc(auditLog.at), desc(auditLog.id))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return {
            items: page.map(toEntry),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ c: last.at.toISOString(), id: last.id })
                : null,
          };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const rows = await ctx.db
            .select()
            .from(auditLog)
            .where(eq(auditLog.actorId, req.params.id))
            .orderBy(desc(auditLog.at))
            .limit(1000);
          return { service: 'audit', data: { actions: rows.map(toEntry) } };
        },
      );
    },
  };
}

async function handle(ctx: ServiceContext<AuditConfig>, event: EventEnvelope) {
  await ctx.once('audit', event, async (tx) => {
    if (event.type === 'audit.recorded') {
      const data = event.data as EventData<'audit.recorded'>;
      await tx
        .insert(auditLog)
        .values({
          eventId: event.id,
          actorId: data.actorId,
          actorRole: data.actorRole,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          details: data.details,
          at: new Date(data.at),
        })
        .onConflictDoNothing();
    } else if (event.type === 'privacy.deletion.requested') {
      // The record of what was done stays; who did it stops pointing at a person who asked to be forgotten.
      const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
      await tx.update(auditLog).set({ actorId: null }).where(eq(auditLog.actorId, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', { requestId, userId, service: 'audit' });
    }
  });
}
