import { randomInt } from 'node:crypto';
import {
  engagement,
  Ok,
  PageQuery,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import { istDate, weekStart } from '@logicpath/gamification-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  conflict,
  decodeCursor,
  encodeCursor,
  notFound,
  problems,
  requireInternal,
  requireRole,
  requireUser,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { classes, learnerStats, members, people, weeklyXp } from './schema';

export const env = {};
export type ClassroomConfig = ReturnType<typeof loadConfig<typeof env>>;

type Class = typeof classes.$inferSelect;

/** No 0/O or 1/I: codes get read aloud and typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

export function classroomService(config: ClassroomConfig): ServiceDefinition<ClassroomConfig> {
  return {
    title: 'LogicPath Classroom',
    description: 'Classes: a teacher’s group of learners, joined with a code.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'classroom',
        types: [
          'identity.user.registered',
          'identity.user.role_changed',
          'profile.updated',
          'progress.concept.mastered',
          'progress.streak.updated',
          'gamification.xp.awarded',
          'privacy.deletion.requested',
        ],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      const { db } = ctx;

      async function summaries(
        rows: readonly Class[],
        showCode: (row: Class) => boolean,
      ): Promise<engagement.ClassSummary[]> {
        if (rows.length === 0) return [];
        const ids = rows.map((r) => r.id);
        const counts = await db
          .select({ classId: members.classId, n: count() })
          .from(members)
          .where(inArray(members.classId, ids))
          .groupBy(members.classId);
        const owners = await db
          .select()
          .from(people)
          .where(
            inArray(
              people.userId,
              rows.map((r) => r.ownerId),
            ),
          );
        const memberCount = new Map(counts.map((c) => [c.classId, Number(c.n)]));
        const ownerName = new Map(owners.map((o) => [o.userId, o.name]));
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: showCode(row) ? row.code : null,
          ownerId: row.ownerId,
          ownerName: ownerName.get(row.ownerId) ?? 'Unknown',
          memberCount: memberCount.get(row.id) ?? 0,
          createdAt: row.createdAt.toISOString(),
        }));
      }

      async function load(id: string): Promise<Class> {
        const [row] = await db.select().from(classes).where(eq(classes.id, id));
        if (!row) throw notFound('Class');
        return row;
      }

      const audit = (
        tx: Tx,
        admin: { id: string; role: 'student' | 'writer' | 'admin' },
        action: string,
        classId: string,
        details: Record<string, unknown>,
      ) =>
        ctx.emit(tx, 'audit.recorded', {
          actorId: admin.id,
          actorRole: admin.role,
          action,
          targetType: 'class',
          targetId: classId,
          details,
          at: new Date().toISOString(),
        });

      app.get(
        '/v1/classes',
        {
          schema: {
            tags: ['classes'],
            summary: 'Classes I run or have joined',
            security: [{ bearer: [] }],
            response: { 200: engagement.ClassList, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const rows = await db
            .select()
            .from(classes)
            .where(
              or(
                eq(classes.ownerId, me.id),
                inArray(
                  classes.id,
                  db.select({ id: members.classId }).from(members).where(eq(members.userId, me.id)),
                ),
              ),
            )
            .orderBy(desc(classes.createdAt), desc(classes.id));
          return {
            items: await summaries(rows, (c) => c.ownerId === me.id || me.role === 'admin'),
          };
        },
      );

      app.post(
        '/v1/classes/join',
        {
          schema: {
            tags: ['classes'],
            summary: 'Join a class with its code',
            security: [{ bearer: [] }],
            body: engagement.JoinClass,
            response: { 200: engagement.ClassSummary, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const [row] = await db.select().from(classes).where(eq(classes.code, req.body.code));
          if (!row) throw notFound('A class with that code');
          if (row.ownerId === me.id) throw conflict('You run this class');
          await db.transaction(async (tx) => {
            const [joined] = await tx
              .insert(members)
              .values({ classId: row.id, userId: me.id })
              .onConflictDoNothing()
              .returning();
            // Joining twice changes nothing and announces nothing.
            if (joined) {
              await ctx.emit(tx, 'classroom.member.joined', {
                classId: row.id,
                userId: me.id,
                ownerId: row.ownerId,
                className: row.name,
              });
            }
          });
          return (await summaries([row], () => false))[0]!;
        },
      );

      app.get(
        '/v1/classes/:id',
        {
          schema: {
            tags: ['classes'],
            summary: 'One class; teachers also get the roster',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: engagement.ClassDetail, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const row = await load(req.params.id);
          const owner = row.ownerId === me.id || me.role === 'admin';
          const [membership] = await db
            .select()
            .from(members)
            .where(and(eq(members.classId, row.id), eq(members.userId, me.id)));
          if (!owner && !membership) throw notFound('Class');
          const [summary] = await summaries([row], () => owner);
          if (!owner) return { ...summary!, members: [] };

          const roster = await db
            .select({
              userId: members.userId,
              joinedAt: members.joinedAt,
              name: people.name,
              conceptsMastered: learnerStats.conceptsMastered,
              lastActiveOn: learnerStats.lastActiveOn,
              xp: weeklyXp.xp,
            })
            .from(members)
            .leftJoin(people, eq(people.userId, members.userId))
            .leftJoin(learnerStats, eq(learnerStats.userId, members.userId))
            .leftJoin(
              weeklyXp,
              and(
                eq(weeklyXp.userId, members.userId),
                eq(weeklyXp.weekStart, weekStart(istDate(new Date()))),
              ),
            )
            .where(eq(members.classId, row.id));
          return {
            ...summary!,
            members: roster
              .map((m) => ({
                userId: m.userId,
                name: m.name ?? 'Unknown',
                joinedAt: m.joinedAt.toISOString(),
                conceptsMastered: m.conceptsMastered ?? 0,
                xpThisWeek: m.xp ?? 0,
                lastActiveOn: m.lastActiveOn,
              }))
              .sort((a, b) => b.xpThisWeek - a.xpThisWeek || a.name.localeCompare(b.name)),
          };
        },
      );

      app.delete(
        '/v1/classes/:id/membership',
        {
          schema: {
            tags: ['classes'],
            summary: 'Leave a class',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const left = await db
            .delete(members)
            .where(and(eq(members.classId, req.params.id), eq(members.userId, me.id)))
            .returning();
          if (left.length === 0) throw notFound('Membership');
          return { ok: true as const };
        },
      );

      // ---------- admin ----------

      app.get(
        '/v1/admin/classes',
        {
          schema: {
            tags: ['classes'],
            summary: 'Every class',
            security: [{ bearer: [] }],
            querystring: PageQuery,
            response: { 200: engagement.ClassPage, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const { limit } = req.query;
          const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
          const rows = await db
            .select()
            .from(classes)
            .where(
              cursor
                ? or(
                    lt(classes.createdAt, new Date(cursor.c)),
                    and(eq(classes.createdAt, new Date(cursor.c)), lt(classes.id, cursor.id)),
                  )
                : undefined,
            )
            .orderBy(desc(classes.createdAt), desc(classes.id))
            .limit(limit + 1);
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return {
            items: await summaries(page, () => true),
            nextCursor:
              rows.length > limit && last
                ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
                : null,
          };
        },
      );

      app.post(
        '/v1/admin/classes',
        {
          schema: {
            tags: ['classes'],
            summary: 'Create a class for a writer or an admin',
            security: [{ bearer: [] }],
            body: engagement.CreateClass,
            response: { 201: engagement.ClassSummary, ...problems },
          },
        },
        async (req, reply) => {
          const admin = requireRole(req, 'admin');
          const ownerId = req.body.ownerId ?? admin.id;
          const [owner] = await db.select().from(people).where(eq(people.userId, ownerId));
          // An admin who signed in before this service saw them is still an admin.
          const ownerRole = owner?.role ?? (ownerId === admin.id ? admin.role : 'student');
          if (ownerRole === 'student') throw conflict('A class is run by a writer or an admin');
          let row: Class | undefined;
          while (!row) {
            try {
              row = await db.transaction(async (tx) => {
                const [created] = await tx
                  .insert(classes)
                  .values({ name: req.body.name, code: newCode(), ownerId })
                  .returning();
                await audit(tx, admin, 'class.created', created!.id, { name: created!.name });
                return created!;
              });
            } catch (error) {
              if (!isUniqueViolation(error)) throw error; // a code that already exists: draw another
            }
          }
          return reply.status(201).send((await summaries([row], () => true))[0]!);
        },
      );

      app.post(
        '/v1/admin/classes/:id/code',
        {
          schema: {
            tags: ['classes'],
            summary: 'Replace a class’s join code',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: engagement.ClassSummary, ...problems },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          await load(req.params.id);
          for (;;) {
            try {
              const row = await db.transaction(async (tx) => {
                const [updated] = await tx
                  .update(classes)
                  .set({ code: newCode() })
                  .where(eq(classes.id, req.params.id))
                  .returning();
                await audit(tx, admin, 'class.code_replaced', req.params.id, {});
                return updated!;
              });
              return (await summaries([row], () => true))[0]!;
            } catch (error) {
              if (!isUniqueViolation(error)) throw error;
            }
          }
        },
      );

      app.delete(
        '/v1/admin/classes/:id',
        {
          schema: {
            tags: ['classes'],
            summary: 'Delete a class and its roster',
            security: [{ bearer: [] }],
            params: z.object({ id: z.uuid() }),
            response: { 200: Ok, ...problems },
          },
        },
        async (req) => {
          const admin = requireRole(req, 'admin');
          await db.transaction(async (tx) => {
            const [gone] = await tx
              .delete(classes)
              .where(eq(classes.id, req.params.id))
              .returning();
            if (!gone) throw notFound('Class');
            await audit(tx, admin, 'class.deleted', gone.id, { name: gone.name });
          });
          return { ok: true as const };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const joined = await db
            .select({ classId: members.classId, joinedAt: members.joinedAt })
            .from(members)
            .where(eq(members.userId, req.params.id));
          const owned = await db
            .select({ id: classes.id, name: classes.name })
            .from(classes)
            .where(eq(classes.ownerId, req.params.id));
          return { service: 'classroom', data: { joined, owned } };
        },
      );
    },
  };
}

async function handle(ctx: ServiceContext<ClassroomConfig>, event: EventEnvelope) {
  await ctx.once('classroom', event, async (tx) => {
    switch (event.type) {
      case 'identity.user.registered': {
        const d = event.data as EventData<'identity.user.registered'>;
        await tx
          .insert(people)
          .values({ userId: d.userId, name: d.name, role: d.role })
          .onConflictDoUpdate({ target: people.userId, set: { role: d.role } });
        break;
      }
      case 'identity.user.role_changed': {
        const d = event.data as EventData<'identity.user.role_changed'>;
        await tx
          .insert(people)
          .values({ userId: d.userId, name: 'Unknown', role: d.role })
          .onConflictDoUpdate({ target: people.userId, set: { role: d.role } });
        break;
      }
      case 'profile.updated': {
        const d = event.data as EventData<'profile.updated'>;
        await tx
          .insert(people)
          .values({ userId: d.userId, name: d.displayName })
          .onConflictDoUpdate({ target: people.userId, set: { name: d.displayName } });
        break;
      }
      case 'progress.concept.mastered': {
        const d = event.data as EventData<'progress.concept.mastered'>;
        await tx
          .insert(learnerStats)
          .values({ userId: d.userId, conceptsMastered: 1 })
          .onConflictDoUpdate({
            target: learnerStats.userId,
            set: { conceptsMastered: sql`${learnerStats.conceptsMastered} + 1` },
          });
        break;
      }
      case 'progress.streak.updated': {
        const d = event.data as EventData<'progress.streak.updated'>;
        await tx
          .insert(learnerStats)
          .values({ userId: d.userId, lastActiveOn: d.localDate })
          .onConflictDoUpdate({
            target: learnerStats.userId,
            set: {
              lastActiveOn: sql`GREATEST(${learnerStats.lastActiveOn}, ${d.localDate}::date)`,
            },
          });
        break;
      }
      case 'gamification.xp.awarded': {
        const d = event.data as EventData<'gamification.xp.awarded'>;
        await tx
          .insert(weeklyXp)
          .values({ userId: d.userId, weekStart: d.weekStart, xp: d.amount })
          .onConflictDoUpdate({
            target: [weeklyXp.userId, weeklyXp.weekStart],
            set: { xp: sql`${weeklyXp.xp} + ${d.amount}` },
          });
        break;
      }
      case 'privacy.deletion.requested': {
        const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
        await tx.delete(members).where(eq(members.userId, userId));
        // A teacher who is forgotten takes their classes with them.
        await tx.delete(classes).where(eq(classes.ownerId, userId));
        await tx.delete(people).where(eq(people.userId, userId));
        await tx.delete(learnerStats).where(eq(learnerStats.userId, userId));
        await tx.delete(weeklyXp).where(eq(weeklyXp.userId, userId));
        await ctx.emit(tx, 'privacy.deletion.completed', {
          requestId,
          userId,
          service: 'classroom',
        });
        break;
      }
      default:
        break;
    }
  });
}
