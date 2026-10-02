import { engagement, type EventData, type EventEnvelope } from '@logicpath/contracts';
import {
  BADGES,
  emptyStats,
  istDate,
  levelFor,
  levelInfo,
  newBadges,
  statsAfterAttempt,
  weekStart,
  type LearnerStats,
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
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { badges, prefs, stats, totals, xpLedger } from './schema';

export const env = {};
export type GamificationConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<GamificationConfig>;
type Locale = 'en' | 'hi-Latn';

const REASONS: Record<string, [string, string]> = {
  attempt: ['Correct answer', 'Sahi jawab'],
  'daily-goal': ['Daily goal reached', 'Daily goal poora'],
  streak: ['Streak bonus', 'Streak bonus'],
  lesson: ['Lesson finished', 'Lesson poora'],
};
const reasonText = (reason: string, locale: Locale) => {
  const text = REASONS[reason] ?? [reason, reason];
  return locale === 'en' ? text[0] : text[1];
};

/**
 * XP, levels and badges. It keeps the ledger of every payment and the counters behind the badge
 * rules, both built from the events other services publish, and announces levels and badges.
 */
export function gamificationService(
  config: GamificationConfig,
): ServiceDefinition<GamificationConfig> {
  return {
    title: 'LogicPath Gamification',
    description: 'XP, levels and badges: what effort earns, and the record of it.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'gamification',
        types: [
          'practice.attempt.recorded',
          'progress.lesson.completed',
          'progress.concept.mastered',
          'progress.streak.updated',
          'leaderboard.week.closed',
          'classroom.member.joined',
          'profile.updated',
          'privacy.deletion.requested',
        ],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      const { db } = ctx;

      app.get(
        '/v1/rewards/me',
        {
          schema: {
            tags: ['rewards'],
            summary: 'My XP, level and badges',
            security: [{ bearer: [] }],
            response: { 200: engagement.Rewards, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const [total] = await db.select().from(totals).where(eq(totals.userId, me.id));
          const xp = total?.xp ?? 0;
          const [pref] = await db.select().from(prefs).where(eq(prefs.userId, me.id));
          const locale = pref?.locale ?? 'en';
          const [{ week }] = (await db
            .select({ week: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
            .from(xpLedger)
            .where(
              and(
                eq(xpLedger.userId, me.id),
                eq(xpLedger.weekStart, weekStart(istDate(new Date()))),
              ),
            )) as [{ week: number }];
          const owned = await db.select().from(badges).where(eq(badges.userId, me.id));
          const recent = await db
            .select()
            .from(xpLedger)
            .where(eq(xpLedger.userId, me.id))
            .orderBy(desc(xpLedger.id))
            .limit(10);
          return {
            xp,
            ...levelInfo(xp),
            xpThisWeek: Number(week),
            badges: owned
              .sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime())
              .map((b) => ({ id: b.badgeId, earnedAt: b.earnedAt.toISOString() })),
            recent: recent.map((row) => ({
              amount: row.amount,
              reason: reasonText(row.reason, locale),
              at: row.at.toISOString(),
            })),
          };
        },
      );

      app.get(
        '/v1/rewards/badges',
        {
          schema: {
            tags: ['rewards'],
            summary: 'Every badge there is',
            response: { 200: z.object({ items: z.array(engagement.Badge) }) },
          },
        },
        async () => ({ items: [...BADGES] }),
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const [total] = await db.select().from(totals).where(eq(totals.userId, req.params.id));
          const ledger = await db
            .select()
            .from(xpLedger)
            .where(eq(xpLedger.userId, req.params.id))
            .orderBy(desc(xpLedger.id))
            .limit(2000);
          const owned = await db.select().from(badges).where(eq(badges.userId, req.params.id));
          return {
            service: 'gamification',
            data: {
              xp: total?.xp ?? 0,
              ledger: ledger.map((r) => ({
                amount: r.amount,
                reason: r.reason,
                at: r.at.toISOString(),
              })),
              badges: owned.map((b) => ({ id: b.badgeId, earnedAt: b.earnedAt.toISOString() })),
            },
          };
        },
      );
    },
  };
}

// ---------- reacting to what happened elsewhere ----------

async function statsOf(tx: Tx, userId: string): Promise<LearnerStats> {
  await tx.insert(stats).values({ userId, stats: emptyStats() }).onConflictDoNothing();
  const [row] = await tx.select().from(stats).where(eq(stats.userId, userId)).for('update');
  return row!.stats;
}

/** Pays XP, then announces a level reached. */
async function pay(
  ctx: Ctx,
  tx: Tx,
  userId: string,
  parts: readonly { amount: number; reason: string }[],
  at: Date,
) {
  const paid = parts.filter((p) => p.amount > 0);
  if (paid.length === 0) return;
  const week = weekStart(istDate(at));
  await tx.insert(totals).values({ userId, xp: 0 }).onConflictDoNothing();
  const [before] = await tx.select().from(totals).where(eq(totals.userId, userId)).for('update');
  const sum = paid.reduce((acc, p) => acc + p.amount, 0);
  await tx
    .insert(xpLedger)
    .values(paid.map((p) => ({ userId, amount: p.amount, reason: p.reason, weekStart: week, at })));
  const after = before!.xp + sum;
  await tx.update(totals).set({ xp: after }).where(eq(totals.userId, userId));
  for (const part of paid) {
    await ctx.emit(tx, 'gamification.xp.awarded', {
      userId,
      amount: part.amount,
      reason: part.reason,
      weekStart: week,
      at: at.toISOString(),
    });
  }
  if (levelFor(after) > levelFor(before!.xp)) {
    await ctx.emit(tx, 'gamification.level.up', { userId, level: levelFor(after), xp: after });
  }
}

/** Saves the counters and hands out any badge they now qualify for. */
async function awardBadges(ctx: Ctx, tx: Tx, userId: string, next: LearnerStats, at: Date) {
  await tx.update(stats).set({ stats: next }).where(eq(stats.userId, userId));
  const owned = await tx
    .select({ id: badges.badgeId })
    .from(badges)
    .where(eq(badges.userId, userId));
  const earned = newBadges(next, new Set(owned.map((b) => b.id)));
  for (const badgeId of earned) {
    await tx.insert(badges).values({ userId, badgeId, earnedAt: at }).onConflictDoNothing();
    await ctx.emit(tx, 'gamification.badge.earned', { userId, badgeId, at: at.toISOString() });
  }
}

async function handle(ctx: Ctx, event: EventEnvelope) {
  await ctx.once('gamification', event, async (tx) => {
    switch (event.type) {
      case 'practice.attempt.recorded': {
        const d = event.data as EventData<'practice.attempt.recorded'>;
        const at = new Date(d.at);
        const before = await statsOf(tx, d.userId);
        await pay(ctx, tx, d.userId, d.xp, at);
        await awardBadges(
          ctx,
          tx,
          d.userId,
          statsAfterAttempt(before, {
            correct: d.correct,
            hintLevel: d.hintLevel,
            source: d.source,
            solutionShown: d.solutionShown,
          }),
          at,
        );
        break;
      }
      case 'progress.lesson.completed': {
        const d = event.data as EventData<'progress.lesson.completed'>;
        const at = new Date(d.at);
        const before = await statsOf(tx, d.userId);
        await pay(ctx, tx, d.userId, d.xp, at);
        await awardBadges(
          ctx,
          tx,
          d.userId,
          { ...before, lessonsCompleted: before.lessonsCompleted + 1 },
          at,
        );
        break;
      }
      case 'progress.concept.mastered': {
        const d = event.data as EventData<'progress.concept.mastered'>;
        const before = await statsOf(tx, d.userId);
        await awardBadges(
          ctx,
          tx,
          d.userId,
          { ...before, conceptsMastered: before.conceptsMastered + 1 },
          new Date(d.at),
        );
        break;
      }
      case 'progress.streak.updated': {
        const d = event.data as EventData<'progress.streak.updated'>;
        const before = await statsOf(tx, d.userId);
        await awardBadges(
          ctx,
          tx,
          d.userId,
          { ...before, longestStreak: Math.max(before.longestStreak, d.longest) },
          new Date(event.occurredAt),
        );
        break;
      }
      case 'leaderboard.week.closed': {
        const d = event.data as EventData<'leaderboard.week.closed'>;
        if (d.result !== 'promoted') break;
        const before = await statsOf(tx, d.userId);
        await awardBadges(
          ctx,
          tx,
          d.userId,
          { ...before, promotions: before.promotions + 1 },
          new Date(event.occurredAt),
        );
        break;
      }
      case 'classroom.member.joined': {
        const d = event.data as EventData<'classroom.member.joined'>;
        const before = await statsOf(tx, d.userId);
        await awardBadges(
          ctx,
          tx,
          d.userId,
          { ...before, classesJoined: before.classesJoined + 1 },
          new Date(event.occurredAt),
        );
        break;
      }
      case 'profile.updated': {
        const d = event.data as EventData<'profile.updated'>;
        await tx
          .insert(prefs)
          .values({ userId: d.userId, locale: d.locale })
          .onConflictDoUpdate({ target: prefs.userId, set: { locale: d.locale } });
        break;
      }
      case 'privacy.deletion.requested': {
        const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
        await tx.delete(xpLedger).where(eq(xpLedger.userId, userId));
        await tx.delete(totals).where(eq(totals.userId, userId));
        await tx.delete(stats).where(eq(stats.userId, userId));
        await tx.delete(badges).where(eq(badges.userId, userId));
        await tx.delete(prefs).where(eq(prefs.userId, userId));
        await ctx.emit(tx, 'privacy.deletion.completed', {
          requestId,
          userId,
          service: 'gamification',
        });
        break;
      }
      default:
        break;
    }
  });
}
