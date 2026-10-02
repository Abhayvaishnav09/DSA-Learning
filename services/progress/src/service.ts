import {
  internal,
  learning,
  Problem,
  type EventData,
  type EventEnvelope,
} from '@logicpath/contracts';
import type { ReviewCard } from '@logicpath/learning-engine';
import {
  applyGraded,
  buildGraph,
  completeLesson,
  emptyState,
  engineState,
  InvalidAnswerError,
  progressMap,
  saveLessonPosition,
  type LearnerState,
} from '@logicpath/progress-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  badRequest,
  ContentCache,
  HttpProblem,
  internalFetch,
  notFound,
  problems,
  requireInternal,
  requireUser,
  serviceUrl,
  serviceUrls,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { appliedAttempts, learners, prefs } from './schema';

export const env = {
  ...serviceUrls('review'),
  CONTENT_URL: z.url().default('http://127.0.0.1:4104'),
  /** A bundle file to use instead of the content service (local runs and tests). */
  CONTENT_BUNDLE_PATH: z.string().optional(),
  /** Answers are remembered this long, so a retried answer is recognised. */
  APPLIED_DAYS: z.coerce.number().int().min(1).default(30),
  /** How often old remembered answers are cleared; 0 turns the loop off. */
  PRUNE_EVERY_SECONDS: z.coerce.number().int().min(0).default(3600),
};
export type ProgressConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<ProgressConfig>;

const DEFAULT_ZONE = 'Asia/Kolkata';
const DEFAULT_GOAL = 10;

/**
 * Where each learner stands: mastery per concept, lessons, streak and the day's totals. This
 * service owns that record and applies every answer to it in one transaction; the rules are the
 * shared `progress-rules` package, the same ones the apps run on the device.
 */
export function progressService(config: ProgressConfig): ServiceDefinition<ProgressConfig> {
  let content: ContentCache | null = null;
  let graph: { checksum: string; value: ReturnType<typeof buildGraph> } | null = null;
  const graphOf = (snapshot: {
    checksum: string;
    bundle: { concepts: Parameters<typeof buildGraph>[0] };
  }) => {
    if (graph?.checksum !== snapshot.checksum) {
      graph = { checksum: snapshot.checksum, value: buildGraph(snapshot.bundle.concepts) };
    }
    return graph.value;
  };
  const live = (ctx: Ctx) => (content ??= new ContentCache(config, ctx.log)).get();
  const refresh = (ctx: Ctx) => (content ??= new ContentCache(config, ctx.log)).refresh();
  const timers: NodeJS.Timeout[] = [];

  /** Locks a learner's record for the rest of the transaction, creating it for a newcomer. */
  async function lockLearner(tx: Tx, userId: string): Promise<LearnerState> {
    await tx.insert(learners).values({ userId, state: emptyState() }).onConflictDoNothing();
    const [row] = await tx.select().from(learners).where(eq(learners.userId, userId)).for('update');
    return row!.state;
  }

  async function settingsOf(db: Tx, userId: string) {
    const [row] = await db.select().from(prefs).where(eq(prefs.userId, userId));
    return {
      timeZone: row?.timeZone ?? DEFAULT_ZONE,
      goalMinutes: row?.dailyGoalMinutes ?? DEFAULT_GOAL,
    };
  }

  /** Streak and mastery changes are news for other services. */
  async function announce(
    ctx: Ctx,
    tx: Tx,
    userId: string,
    before: LearnerState,
    after: LearnerState,
    masteredConcept: string | null,
    at: string,
  ) {
    if (masteredConcept) {
      await ctx.emit(tx, 'progress.concept.mastered', { userId, conceptId: masteredConcept, at });
    }
    if (after.streak.lastActiveOn && after.streak.lastActiveOn !== before.streak.lastActiveOn) {
      await ctx.emit(tx, 'progress.streak.updated', {
        userId,
        current: after.streak.current,
        longest: after.streak.longest,
        localDate: after.streak.lastActiveOn,
      });
    }
  }

  async function applyAttempt(
    ctx: Ctx,
    userId: string,
    body: internal.ApplyAttempt,
  ): Promise<internal.AppliedAttempt> {
    const { request, graded } = body;
    let snapshot = await live(ctx);
    let item = snapshot.bundle.items[request.itemId];
    if (!item) {
      // A question published a moment ago: look again before saying it does not exist.
      await refresh(ctx);
      snapshot = await live(ctx);
      item = snapshot.bundle.items[request.itemId];
    }
    if (!item) throw notFound('Question');

    return ctx.db.transaction(async (tx) => {
      const state = await lockLearner(tx, userId);
      const [seen] = await tx
        .select()
        .from(appliedAttempts)
        .where(eq(appliedAttempts.attemptId, request.id));
      if (seen) return { ...seen.outcome, duplicate: true };

      const { timeZone, goalMinutes } = await settingsOf(tx, userId);
      const now = new Date();
      let outcome;
      try {
        outcome = applyGraded(state, request, graded, {
          item,
          graph: graphOf(snapshot),
          now,
          timeZone,
          goalMinutes,
          schedule: false, // the review service keeps the cards
        });
      } catch (error) {
        if (error instanceof InvalidAnswerError) throw badRequest(error.message);
        throw error;
      }
      await tx
        .update(learners)
        .set({ state: outcome.state, updatedAt: now })
        .where(eq(learners.userId, userId));
      const stored = {
        result: outcome.result,
        xp: outcome.xp.filter((part) => part.amount > 0),
        concluded: outcome.concluded,
        completion: outcome.completion,
        masteredNow: outcome.masteredNow,
      };
      await tx.insert(appliedAttempts).values({ attemptId: request.id, userId, outcome: stored });
      await announce(
        ctx,
        tx,
        userId,
        state,
        outcome.state,
        outcome.masteredNow ? item.concept : null,
        now.toISOString(),
      );
      return { ...stored, duplicate: false };
    });
  }

  return {
    title: 'LogicPath Progress',
    description:
      'Where each learner stands: mastery, lessons, streak and the day’s goal. Applies every graded answer.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'progress',
        types: ['profile.updated', 'content.version.published', 'privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    onStart: (ctx) => {
      if (config.PRUNE_EVERY_SECONDS > 0) {
        timers.push(
          setInterval(
            () =>
              void ctx.db
                .delete(appliedAttempts)
                .where(
                  lt(
                    appliedAttempts.appliedAt,
                    new Date(Date.now() - config.APPLIED_DAYS * 86_400_000),
                  ),
                )
                .catch((error) => ctx.log.error({ err: error }, 'pruning applied answers failed')),
            config.PRUNE_EVERY_SECONDS * 1000,
          ).unref(),
        );
      }
    },
    onStop: () => {
      for (const timer of timers.splice(0)) clearInterval(timer);
    },
    routes: (app, ctx) => {
      const { db } = ctx;
      const stateOf = async (userId: string): Promise<LearnerState> => {
        const [row] = await db.select().from(learners).where(eq(learners.userId, userId));
        return row?.state ?? emptyState();
      };
      const lessonView = (state: LearnerState, conceptId: string): learning.LessonState => {
        const lesson = state.lessons[conceptId]!;
        return {
          conceptId,
          beat: lesson.beat,
          practiceIndex: lesson.practiceIndex,
          startedAt: lesson.startedAt,
          completedAt: lesson.completedAt,
        };
      };
      const requireLesson = async (ctx2: Ctx, conceptId: string) => {
        const snapshot = await live(ctx2);
        if (!snapshot.bundle.lessons[conceptId]) throw notFound('Lesson');
      };

      app.get(
        '/v1/progress',
        {
          schema: {
            tags: ['progress'],
            summary: 'My map: each concept’s status and mastery, lessons, streak and today',
            security: [{ bearer: [] }],
            response: { 200: learning.ProgressMap, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const snapshot = await live(ctx);
          const { timeZone, goalMinutes } = await settingsOf(db, me.id);
          return progressMap(
            await stateOf(me.id),
            graphOf(snapshot),
            snapshot.number,
            goalMinutes,
            new Date(),
            timeZone,
          );
        },
      );

      app.get(
        '/v1/progress/state',
        {
          schema: {
            tags: ['progress'],
            summary: 'Everything my device needs to continue where I left off',
            security: [{ bearer: [] }],
            response: { 200: learning.EngineState, 503: Problem, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          let cards: Record<string, ReviewCard>;
          try {
            cards = await internalFetch<Record<string, ReviewCard>>(
              config,
              `${serviceUrl(config, 'review')}/internal/users/${me.id}/cards`,
            );
          } catch (error) {
            ctx.log.warn({ err: error }, 'review service not reachable');
            throw new HttpProblem(
              503,
              'unavailable',
              'Not available right now',
              'Review cards could not be loaded. Try again in a moment.',
            );
          }
          return { ...engineState(await stateOf(me.id)), cards };
        },
      );

      app.put(
        '/v1/progress/lessons/:conceptId',
        {
          schema: {
            tags: ['progress'],
            summary: 'Remember where I am in a lesson',
            security: [{ bearer: [] }],
            params: z.object({ conceptId: z.string() }),
            body: learning.LessonPosition,
            response: { 200: learning.LessonState, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          await requireLesson(ctx, req.params.conceptId);
          return db.transaction(async (tx) => {
            const state = await lockLearner(tx, me.id);
            const next = saveLessonPosition(
              state,
              req.params.conceptId,
              req.body.beat,
              req.body.practiceIndex ?? 0,
              new Date(),
            );
            await tx
              .update(learners)
              .set({ state: next, updatedAt: new Date() })
              .where(eq(learners.userId, me.id));
            return lessonView(next, req.params.conceptId);
          });
        },
      );

      app.post(
        '/v1/progress/lessons/:conceptId/complete',
        {
          schema: {
            tags: ['progress'],
            summary: 'Finish a lesson',
            security: [{ bearer: [] }],
            params: z.object({ conceptId: z.string() }),
            response: { 200: learning.LessonState, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          await requireLesson(ctx, req.params.conceptId);
          return db.transaction(async (tx) => {
            const state = await lockLearner(tx, me.id);
            const { timeZone } = await settingsOf(tx, me.id);
            const now = new Date();
            const done = completeLesson(state, req.params.conceptId, now, timeZone);
            await tx
              .update(learners)
              .set({ state: done.state, updatedAt: now })
              .where(eq(learners.userId, me.id));
            if (done.firstTime) {
              await ctx.emit(tx, 'progress.lesson.completed', {
                userId: me.id,
                conceptId: req.params.conceptId,
                xp: done.xp.filter((part) => part.amount > 0),
                at: now.toISOString(),
              });
              await announce(ctx, tx, me.id, state, done.state, null, now.toISOString());
            }
            return lessonView(done.state, req.params.conceptId);
          });
        },
      );

      // ---------- used by the practice service ----------

      app.post(
        '/internal/learners/:userId/attempts',
        {
          schema: {
            hide: true,
            params: z.object({ userId: z.uuid() }),
            body: internal.ApplyAttempt,
          },
        },
        async (req) => {
          requireInternal(req, config);
          return applyAttempt(ctx, req.params.userId, req.body);
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const [row] = await db.select().from(learners).where(eq(learners.userId, req.params.id));
          return {
            service: 'progress',
            data: row ? { state: row.state, updatedAt: row.updatedAt } : null,
          };
        },
      );
    },
  };

  async function handle(ctx: Ctx, event: EventEnvelope) {
    // The curriculum changed: look at it again (not once-only, so a replay after a restart refreshes too).
    if (event.type === 'content.version.published') {
      await refresh(ctx);
      return;
    }
    await ctx.once('progress', event, async (tx) => {
      if (event.type === 'profile.updated') {
        const d = event.data as EventData<'profile.updated'>;
        await tx
          .insert(prefs)
          .values({ userId: d.userId, timeZone: d.timeZone, dailyGoalMinutes: d.dailyGoalMinutes })
          .onConflictDoUpdate({
            target: prefs.userId,
            set: { timeZone: d.timeZone, dailyGoalMinutes: d.dailyGoalMinutes },
          });
      } else if (event.type === 'privacy.deletion.requested') {
        const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
        await tx.delete(appliedAttempts).where(eq(appliedAttempts.userId, userId));
        await tx.delete(learners).where(eq(learners.userId, userId));
        await tx.delete(prefs).where(eq(prefs.userId, userId));
        await ctx.emit(tx, 'privacy.deletion.completed', {
          requestId,
          userId,
          service: 'progress',
        });
      }
    });
  }
}
