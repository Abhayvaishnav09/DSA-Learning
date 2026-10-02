import { engagement, type EventData, type EventEnvelope } from '@logicpath/contracts';
import {
  LEAGUE_SIZE,
  LEAGUE_TIERS,
  addDays,
  istDate,
  moveTier,
  rank,
  startOfIstDay,
  weekStart,
  zoneFor,
  type LeagueTier,
} from '@logicpath/gamification-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  problems,
  requireInternal,
  requireUser,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { history, members, settledWeeks, weeklyXp } from './schema';

export const env = {
  /** How often finished weeks are closed; 0 turns the loop off (reads and tests close them too). */
  SETTLE_EVERY_SECONDS: z.coerce.number().int().min(0).default(600),
};
export type LeaderboardConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<LeaderboardConfig>;
type Member = typeof members.$inferSelect;

/**
 * Weekly leagues: learners are grouped by tier in groups of thirty, earn XP through the week
 * (India time, for everyone), and when the week closes the most active move up a tier and the
 * least active move down. The rules are the shared `gamification-rules`.
 */
export function leaderboardService(
  config: LeaderboardConfig,
): ServiceDefinition<LeaderboardConfig> {
  const timers: NodeJS.Timeout[] = [];

  /** The active members of a tier, in the order they joined: groups are cut from this list. */
  async function tierMembers(
    db: Tx,
    tier: LeagueTier,
    only?: readonly string[],
  ): Promise<Member[]> {
    return db
      .select()
      .from(members)
      .where(
        and(
          eq(members.tier, tier),
          eq(members.active, true),
          only ? inArray(members.userId, [...only]) : undefined,
        ),
      )
      .orderBy(asc(members.joinedAt), asc(members.userId));
  }

  /** Closes one finished week: ranks every group that played, moves people, tells everyone. */
  async function settleWeek(ctx: Ctx, monday: string): Promise<void> {
    await ctx.db.transaction(async (tx) => {
      // Two replicas must not close the same week.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('leaderboard.settle'))`);
      const [done] = await tx.select().from(settledWeeks).where(eq(settledWeeks.weekStart, monday));
      if (done) return;
      const xpRows = await tx.select().from(weeklyXp).where(eq(weeklyXp.weekStart, monday));
      const xp = new Map(xpRows.filter((r) => r.xp > 0).map((r) => [r.userId, r.xp]));
      // An empty week changes nothing: only people who earned XP are ranked. Everyone's tier is
      // read before anyone moves, so a learner promoted by this week is not ranked a second time.
      const players = xp.size
        ? await tx
            .select()
            .from(members)
            .where(and(eq(members.active, true), inArray(members.userId, [...xp.keys()])))
            .orderBy(asc(members.joinedAt), asc(members.userId))
        : [];
      for (const tier of LEAGUE_TIERS) {
        const inTier = players.filter((m) => m.tier === tier);
        for (let start = 0; start < inTier.length; start += LEAGUE_SIZE) {
          const group = inTier.slice(start, start + LEAGUE_SIZE);
          const ranked = rank(group.map((m) => ({ userId: m.userId, xp: xp.get(m.userId) ?? 0 })));
          for (const learner of ranked) {
            const zone = zoneFor(learner.rank, ranked.length, tier);
            const result =
              zone === 'promote' ? 'promoted' : zone === 'demote' ? 'demoted' : 'stayed';
            await tx
              .insert(history)
              .values({
                userId: learner.userId,
                weekStart: monday,
                tier,
                rank: learner.rank,
                xp: learner.xp,
                result,
              })
              .onConflictDoNothing();
            const next = moveTier(tier, zone);
            if (next !== tier) {
              await tx
                .update(members)
                .set({ tier: next })
                .where(eq(members.userId, learner.userId));
            }
            await ctx.emit(tx, 'leaderboard.week.closed', {
              userId: learner.userId,
              weekStart: monday,
              tier,
              rank: learner.rank,
              result,
            });
          }
        }
      }
      await tx.insert(settledWeeks).values({ weekStart: monday });
    });
  }

  /** Closes every week that has finished and not been closed yet, oldest first. */
  async function settleDue(ctx: Ctx, now: Date): Promise<number> {
    const current = weekStart(istDate(now));
    const [first] = await ctx.db
      .select({ week: sql<string | null>`min(${weeklyXp.weekStart})::text` })
      .from(weeklyXp);
    if (!first?.week) return 0;
    const closed = new Set(
      (await ctx.db.select({ week: settledWeeks.weekStart }).from(settledWeeks)).map((r) => r.week),
    );
    let settled = 0;
    for (let monday = weekStart(first.week); monday < current; monday = addDays(monday, 7)) {
      if (closed.has(monday)) continue;
      await settleWeek(ctx, monday);
      settled += 1;
    }
    return settled;
  }

  return {
    title: 'LogicPath Leaderboard',
    description: 'Weekly leagues: a small group, one week, the most active move up.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'leaderboard',
        types: [
          'identity.user.registered',
          'consent.granted',
          'consent.denied',
          'profile.updated',
          'gamification.xp.awarded',
          'privacy.deletion.requested',
        ],
        handle: (event) => handle(ctx, event),
      },
    ],
    onStart: (ctx) => {
      if (config.SETTLE_EVERY_SECONDS > 0) {
        timers.push(
          setInterval(
            () =>
              void settleDue(ctx, new Date()).catch((error) =>
                ctx.log.error({ err: error }, 'closing finished weeks failed'),
              ),
            config.SETTLE_EVERY_SECONDS * 1000,
          ).unref(),
        );
      }
    },
    onStop: () => {
      for (const timer of timers.splice(0)) clearInterval(timer);
    },
    routes: (app, ctx) => {
      const { db } = ctx;

      app.get(
        '/v1/leaderboard/league',
        {
          schema: {
            tags: ['leaderboard'],
            summary: 'My league this week',
            security: [{ bearer: [] }],
            response: { 200: engagement.League, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const now = new Date();
          await settleDue(ctx, now);
          const monday = weekStart(istDate(now));
          const endsAt = startOfIstDay(addDays(monday, 7)).toISOString();
          if (me.role !== 'student') {
            // Writers and admins teach; they do not play.
            return { tier: 'bronze' as const, weekStart: monday, endsAt, standings: [] };
          }
          // Someone who plays before the registration event has arrived still gets a place.
          await db.insert(members).values({ userId: me.id, name: me.name }).onConflictDoNothing();
          const [mine] = await db.select().from(members).where(eq(members.userId, me.id));
          if (!mine!.active) return { tier: mine!.tier, weekStart: monday, endsAt, standings: [] };

          const sameTier = await tierMembers(db, mine!.tier);
          const at = sameTier.findIndex((m) => m.userId === me.id);
          const start = Math.floor(at / LEAGUE_SIZE) * LEAGUE_SIZE;
          const group = sameTier.slice(start, start + LEAGUE_SIZE);
          const xpRows = await db
            .select()
            .from(weeklyXp)
            .where(
              and(
                eq(weeklyXp.weekStart, monday),
                inArray(
                  weeklyXp.userId,
                  group.map((m) => m.userId),
                ),
              ),
            );
          const xp = new Map(xpRows.map((r) => [r.userId, r.xp]));
          const ranked = rank(group.map((m) => ({ userId: m.userId, xp: xp.get(m.userId) ?? 0 })));
          const names = new Map(group.map((m) => [m.userId, m.name]));
          return {
            tier: mine!.tier,
            weekStart: monday,
            endsAt,
            standings: ranked.map((r) => ({
              rank: r.rank,
              userId: r.userId,
              displayName: names.get(r.userId) ?? 'Learner',
              xp: r.xp,
              isMe: r.userId === me.id,
              zone: zoneFor(r.rank, ranked.length, mine!.tier),
            })),
          };
        },
      );

      app.get(
        '/v1/leaderboard/history',
        {
          schema: {
            tags: ['leaderboard'],
            summary: 'How my past weeks went',
            security: [{ bearer: [] }],
            response: { 200: engagement.LeagueHistory, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          await settleDue(ctx, new Date());
          const rows = await db
            .select()
            .from(history)
            .where(eq(history.userId, me.id))
            .orderBy(desc(history.weekStart))
            .limit(12);
          return {
            items: rows.map((r) => ({
              weekStart: r.weekStart,
              tier: r.tier,
              rank: r.rank,
              xp: r.xp,
              result: r.result,
            })),
          };
        },
      );

      app.post(
        '/internal/leaderboard/settle',
        { schema: { hide: true, body: z.object({ now: z.iso.datetime().optional() }).nullish() } },
        async (req) => {
          requireInternal(req, config);
          return {
            settled: await settleDue(ctx, req.body?.now ? new Date(req.body.now) : new Date()),
          };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const [member] = await db.select().from(members).where(eq(members.userId, req.params.id));
          const weeks = await db.select().from(history).where(eq(history.userId, req.params.id));
          return { service: 'leaderboard', data: { member: member ?? null, weeks } };
        },
      );
    },
  };
}

async function handle(ctx: Ctx, event: EventEnvelope) {
  await ctx.once('leaderboard', event, async (tx) => {
    switch (event.type) {
      case 'identity.user.registered': {
        const d = event.data as EventData<'identity.user.registered'>;
        if (d.role !== 'student') break;
        await tx
          .insert(members)
          .values({ userId: d.userId, name: d.name, active: d.status === 'active' })
          .onConflictDoNothing();
        break;
      }
      case 'consent.granted': {
        const d = event.data as EventData<'consent.granted'>;
        await tx.update(members).set({ active: true }).where(eq(members.userId, d.userId));
        break;
      }
      case 'consent.denied': {
        const d = event.data as EventData<'consent.denied'>;
        await tx.delete(members).where(eq(members.userId, d.userId));
        break;
      }
      case 'profile.updated': {
        const d = event.data as EventData<'profile.updated'>;
        await tx.update(members).set({ name: d.displayName }).where(eq(members.userId, d.userId));
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
        await tx.delete(weeklyXp).where(eq(weeklyXp.userId, userId));
        await tx.delete(history).where(eq(history.userId, userId));
        await ctx.emit(tx, 'privacy.deletion.completed', {
          requestId,
          userId,
          service: 'leaderboard',
        });
        break;
      }
      default:
        break;
    }
  });
}
