import { profile, Problem, type EventEnvelope, type EventData } from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import {
  requireInternal,
  requireUser,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { profiles } from './schema';

export const env = {};
export type ProfileConfig = ReturnType<typeof loadConfig<typeof env>>;

type Row = typeof profiles.$inferSelect;

const toProfile = (row: Row): profile.Profile => ({
  ...row,
  updatedAt: row.updatedAt.toISOString(),
});

async function announce(ctx: ServiceContext<ProfileConfig>, tx: Tx, row: Row) {
  await ctx.emit(tx, 'profile.updated', {
    userId: row.userId,
    displayName: row.displayName,
    locale: row.locale,
    timeZone: row.timeZone,
    dailyGoalMinutes: row.dailyGoalMinutes,
  });
}

export function profileService(config: ProfileConfig): ServiceDefinition<ProfileConfig> {
  return {
    title: 'LogicPath Profile',
    description: "A learner's personal settings: name, language, time zone, daily goal and theme.",
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'profile',
        types: ['identity.user.registered', 'privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      const { db } = ctx;

      /** The profile, created with defaults if the registration event has not arrived yet. */
      async function ensure(userId: string, name: string): Promise<Row> {
        const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
        if (existing) return existing;
        return db.transaction(async (tx) => {
          const [created] = await tx
            .insert(profiles)
            .values({ userId, displayName: name })
            .onConflictDoNothing()
            .returning();
          if (created) {
            await announce(ctx, tx, created);
            return created;
          }
          const [row] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
          return row!;
        });
      }

      app.get(
        '/v1/me/profile',
        {
          schema: {
            tags: ['profile'],
            summary: 'My profile and settings',
            security: [{ bearer: [] }],
            response: { 200: profile.Profile, 401: Problem },
          },
        },
        async (req) => {
          const me = requireUser(req);
          return toProfile(await ensure(me.id, me.name));
        },
      );

      app.patch(
        '/v1/me/profile',
        {
          schema: {
            tags: ['profile'],
            summary: 'Update my profile and settings',
            security: [{ bearer: [] }],
            body: profile.ProfileUpdate,
            response: { 200: profile.Profile, 400: Problem, 401: Problem },
          },
        },
        async (req) => {
          const me = requireUser(req);
          await ensure(me.id, me.name);
          return db.transaction(async (tx) => {
            const [row] = await tx
              .update(profiles)
              .set({ ...req.body, updatedAt: new Date() })
              .where(eq(profiles.userId, me.id))
              .returning();
            await announce(ctx, tx, row!);
            return toProfile(row!);
          });
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const [row] = await db.select().from(profiles).where(eq(profiles.userId, req.params.id));
          return { service: 'profile', data: row ? toProfile(row) : null };
        },
      );
    },
  };
}

async function handle(ctx: ServiceContext<ProfileConfig>, event: EventEnvelope) {
  await ctx.once('profile', event, async (tx) => {
    if (event.type === 'identity.user.registered') {
      const data = event.data as EventData<'identity.user.registered'>;
      const [row] = await tx
        .insert(profiles)
        .values({ userId: data.userId, displayName: data.name, locale: data.locale })
        .onConflictDoNothing()
        .returning();
      if (row) await announce(ctx, tx, row);
    } else if (event.type === 'privacy.deletion.requested') {
      const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
      await tx.delete(profiles).where(eq(profiles.userId, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', { requestId, userId, service: 'profile' });
    }
  });
}
