import { platform, type EventData, type EventEnvelope } from '@logicpath/contracts';
import { addDays, istDate } from '@logicpath/gamification-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  problems,
  requireInternal,
  requireRole,
  type ServiceContext,
  type ServiceDefinition,
} from '@logicpath/service-kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { attemptFacts, lessonCompletions, signups } from './schema';

export const env = {};
export type AnalyticsConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<AnalyticsConfig>;

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
/** The India-time calendar date of a timestamp column, as text (days are counted in IST everywhere). */
const istDay = (column: unknown) =>
  sql<string>`((${column} AT TIME ZONE 'Asia/Kolkata')::date)::text`;

/** Dates from `days - 1` days ago up to today (India time), oldest first. */
const window = (now: Date, days: number): string[] =>
  Array.from({ length: days }, (_, i) => addDays(istDate(now), i - (days - 1)));

/**
 * What is happening on the platform, for admins and writers: answers per day, who is active,
 * which mistakes are common, which questions are hard. Built only from events, so it never
 * slows the people it describes.
 */
export function analyticsService(config: AnalyticsConfig): ServiceDefinition<AnalyticsConfig> {
  return {
    title: 'LogicPath Analytics',
    description: 'Dashboard numbers for admins and question statistics for writers.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'analytics',
        types: [
          'practice.attempt.recorded',
          'identity.user.registered',
          'progress.lesson.completed',
          'privacy.deletion.requested',
        ],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      const { db } = ctx;

      /** Per-day counts of one column's worth of rows, keyed by India-time date. */
      const perDay = (rows: { day: string; n: number | string }[]) =>
        new Map(rows.map((r) => [r.day, Number(r.n)]));

      app.get(
        '/v1/admin/analytics/overview',
        {
          schema: {
            tags: ['analytics'],
            summary: 'Dashboard numbers',
            security: [{ bearer: [] }],
            querystring: z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }),
            response: { 200: platform.AdminOverview, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'admin');
          const now = new Date();
          const dates = window(now, req.query.days);
          const from = dates[0]!;
          const today = istDate(now);
          const series = (counts: Map<string, number>) =>
            dates.map((date) => ({ date, value: counts.get(date) ?? 0 }));

          const attemptDay = istDay(attemptFacts.at);
          const answered = await db
            .select({
              day: attemptDay.as('day'),
              n: sql<number>`count(*)`.as('n'),
              right: sql<number>`count(*) filter (where ${attemptFacts.correct})`.as('right'),
            })
            .from(attemptFacts)
            .where(sql`${attemptDay} >= ${from}`)
            .groupBy(sql`1`);
          const total = perDay(answered);
          const right = new Map(answered.map((r) => [r.day, Number(r.right)]));

          const signupDay = istDay(signups.at);
          const joined = await db
            .select({ day: signupDay.as('day'), n: sql<number>`count(*)`.as('n') })
            .from(signups)
            .where(sql`${signupDay} >= ${from}`)
            .groupBy(sql`1`);

          const lessonDay = istDay(lessonCompletions.at);
          const lessons = await db
            .select({ day: lessonDay.as('day'), n: sql<number>`count(*)`.as('n') })
            .from(lessonCompletions)
            .where(sql`${lessonDay} >= ${from}`)
            .groupBy(sql`1`);

          const activeSince = async (n: number) => {
            const since = addDays(today, -(n - 1));
            const [row] = await db
              .select({ n: sql<number>`count(distinct ${attemptFacts.userId})` })
              .from(attemptFacts)
              .where(sql`${attemptDay} >= ${since}`);
            return Number(row?.n ?? 0);
          };

          const mistakes = await db
            .select({
              id: attemptFacts.misconception,
              n: sql<number>`count(*)`.as('n'),
            })
            .from(attemptFacts)
            .where(sql`${attemptDay} >= ${from} AND ${attemptFacts.misconception} IS NOT NULL`)
            .groupBy(attemptFacts.misconception)
            .orderBy(sql`2 desc`, attemptFacts.misconception)
            .limit(5);

          // Hard questions: how often the very first try, by each learner, was right.
          const hardest = await db.execute(sql`
            SELECT item_id, count(*)::int AS attempts, avg((correct)::int)::float AS rate
            FROM (
              SELECT DISTINCT ON (user_id, item_id) user_id, item_id, correct, at
              FROM attempt_facts WHERE source <> 'predict'
              ORDER BY user_id, item_id, at
            ) first_tries
            WHERE ((at AT TIME ZONE 'Asia/Kolkata')::date)::text >= ${from}
            GROUP BY item_id HAVING count(*) >= 3
            ORDER BY rate ASC, item_id ASC LIMIT 5`);

          return {
            activeUsers: {
              day: await activeSince(1),
              week: await activeSince(7),
              month: await activeSince(30),
            },
            signups: series(perDay(joined)),
            attempts: series(total),
            // A day nobody answered anything has no rate; leaving it out beats drawing a fall to 0%.
            correctRate: dates
              .filter((date) => total.get(date))
              .map((date) => ({
                date,
                value: round(((right.get(date) ?? 0) / total.get(date)!) * 100),
              })),
            lessonsCompleted: series(perDay(lessons)),
            topMisconceptions: mistakes.map((m) => ({ id: m.id!, count: Number(m.n) })),
            hardestItems: (
              hardest.rows as { item_id: string; attempts: number; rate: number }[]
            ).map((r) => ({
              itemId: r.item_id,
              attempts: Number(r.attempts),
              firstTryRate: round(Number(r.rate), 2),
            })),
          };
        },
      );

      app.get(
        '/v1/studio/analytics/items',
        {
          schema: {
            tags: ['analytics'],
            summary: 'How questions perform',
            security: [{ bearer: [] }],
            querystring: z.object({ conceptId: z.string().optional() }),
            response: { 200: platform.ItemStats, ...problems },
          },
        },
        async (req) => {
          requireRole(req, 'writer');
          const concept = req.query.conceptId;
          const rows = await db.execute(sql`
            WITH scoped AS (
              SELECT * FROM attempt_facts
              WHERE source <> 'predict' ${concept ? sql`AND concept_id = ${concept}` : sql``}
            ), first_tries AS (
              SELECT DISTINCT ON (user_id, item_id) user_id, item_id, correct
              FROM scoped ORDER BY user_id, item_id, at
            ), mistakes AS (
              SELECT DISTINCT ON (item_id) item_id, misconception
              FROM (
                SELECT item_id, misconception, count(*) AS n FROM scoped
                WHERE misconception IS NOT NULL GROUP BY item_id, misconception
              ) m ORDER BY item_id, n DESC, misconception
            )
            SELECT s.item_id, min(s.concept_id) AS concept_id, count(*)::int AS attempts,
              coalesce((SELECT avg((f.correct)::int)::float FROM first_tries f WHERE f.item_id = s.item_id), 0) AS first_try_rate,
              avg(s.hint_level)::float AS avg_hints,
              (avg(s.duration_ms) / 1000.0)::float AS avg_seconds,
              (SELECT m.misconception FROM mistakes m WHERE m.item_id = s.item_id) AS top_misconception
            FROM scoped s GROUP BY s.item_id
            ORDER BY first_try_rate ASC, s.item_id ASC`);
          type Row = {
            item_id: string;
            concept_id: string;
            attempts: number;
            first_try_rate: number;
            avg_hints: number;
            avg_seconds: number;
            top_misconception: string | null;
          };
          return {
            items: (rows.rows as Row[]).map((r) => ({
              itemId: r.item_id,
              conceptId: r.concept_id,
              attempts: Number(r.attempts),
              firstTryRate: round(Number(r.first_try_rate), 2),
              avgHints: round(Number(r.avg_hints), 2),
              avgSeconds: round(Number(r.avg_seconds)),
              topMisconception: r.top_misconception,
            })),
          };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const rows = await db
            .select()
            .from(attemptFacts)
            .where(eq(attemptFacts.userId, req.params.id))
            .limit(5000);
          return {
            service: 'analytics',
            data: {
              answers: rows.map(({ userId: _user, ...r }) => ({ ...r, at: r.at.toISOString() })),
            },
          };
        },
      );
    },
  };
}

async function handle(ctx: Ctx, event: EventEnvelope) {
  await ctx.once('analytics', event, async (tx) => {
    switch (event.type) {
      case 'practice.attempt.recorded': {
        const d = event.data as EventData<'practice.attempt.recorded'>;
        await tx
          .insert(attemptFacts)
          .values({
            attemptId: d.attemptId,
            userId: d.userId,
            itemId: d.itemId,
            conceptId: d.conceptId,
            correct: d.correct,
            hintLevel: d.hintLevel,
            durationMs: d.durationMs,
            misconception: d.misconception,
            source: d.source,
            at: new Date(d.at),
          })
          .onConflictDoNothing();
        break;
      }
      case 'identity.user.registered': {
        const d = event.data as EventData<'identity.user.registered'>;
        if (d.role === 'student') {
          await tx
            .insert(signups)
            .values({ userId: d.userId, at: new Date(event.occurredAt) })
            .onConflictDoNothing();
        }
        break;
      }
      case 'progress.lesson.completed': {
        const d = event.data as EventData<'progress.lesson.completed'>;
        await tx
          .insert(lessonCompletions)
          .values({ userId: d.userId, conceptId: d.conceptId, at: new Date(d.at) })
          .onConflictDoNothing();
        break;
      }
      case 'privacy.deletion.requested': {
        const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
        await tx.delete(attemptFacts).where(eq(attemptFacts.userId, userId));
        await tx.delete(signups).where(eq(signups.userId, userId));
        await tx.delete(lessonCompletions).where(eq(lessonCompletions.userId, userId));
        await ctx.emit(tx, 'privacy.deletion.completed', {
          requestId,
          userId,
          service: 'analytics',
        });
        break;
      }
      default:
        break;
    }
  });
}
