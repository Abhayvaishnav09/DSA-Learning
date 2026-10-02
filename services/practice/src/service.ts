import {
  learning,
  Problem,
  type EventData,
  type EventEnvelope,
  type internal,
} from '@logicpath/contracts';
import { gradeAttempt, InvalidAnswerError } from '@logicpath/progress-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  badRequest,
  conflict,
  ContentCache,
  HttpProblem,
  InternalCallError,
  internalFetch,
  notFound,
  problems,
  requireInternal,
  requireUser,
  serviceUrl,
  serviceUrls,
  type ServiceContext,
  type ServiceDefinition,
} from '@logicpath/service-kit';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { attempts } from './schema';

export const env = {
  ...serviceUrls('progress'),
  CONTENT_URL: z.url().default('http://127.0.0.1:4104'),
  /** A bundle file to use instead of the content service (local runs and tests). */
  CONTENT_BUNDLE_PATH: z.string().optional(),
};
export type PracticeConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<PracticeConfig>;

/** A device clock slightly ahead is fine; further ahead is treated as "now" (as progress does). */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Answering a question: the answer is graded against the published curriculum (never trusted
 * from the device), applied to the learner's record by the progress service, and written down
 * here. Review, XP, leagues and the dashboards follow from the events this service publishes.
 */
export function practiceService(config: PracticeConfig): ServiceDefinition<PracticeConfig> {
  let content: ContentCache | null = null;
  const cache = (ctx: Ctx) => (content ??= new ContentCache(config, ctx.log));

  async function record(
    ctx: Ctx,
    userId: string,
    request: learning.AttemptRequest,
  ): Promise<learning.AttemptResult> {
    const [seen] = await ctx.db.select().from(attempts).where(eq(attempts.id, request.id));
    const again = (row: typeof attempts.$inferSelect): learning.AttemptResult => {
      if (row.userId !== userId) throw conflict('This attempt id is already in use');
      // Resending an answer is safe: nothing is counted twice, and nothing more is paid.
      return { attemptId: row.id, ...row.result, xpAwarded: 0, duplicate: true };
    };
    if (seen) return again(seen);

    let snapshot = await cache(ctx).get();
    let item = snapshot.bundle.items[request.itemId];
    if (!item) {
      // A question published a moment ago: look again before saying it does not exist.
      await cache(ctx).refresh();
      snapshot = await cache(ctx).get();
      item = snapshot.bundle.items[request.itemId];
    }
    if (!item) throw notFound('Question');

    let graded;
    try {
      graded = gradeAttempt(item, request);
    } catch (error) {
      if (error instanceof InvalidAnswerError) throw badRequest(error.message);
      throw error;
    }

    let applied: internal.AppliedAttempt;
    try {
      applied = await internalFetch<internal.AppliedAttempt>(
        config,
        `${serviceUrl(config, 'progress')}/internal/learners/${userId}/attempts`,
        { method: 'POST', body: JSON.stringify({ request, graded }) },
      );
    } catch (error) {
      ctx.log.warn({ err: error }, 'progress service did not accept the answer');
      if (error instanceof InternalCallError && error.status >= 400 && error.status < 500) {
        throw badRequest('The answer could not be applied to your progress');
      }
      throw new HttpProblem(
        503,
        'unavailable',
        'Not available right now',
        'Your answer was not saved. Try again in a moment.',
      );
    }

    const now = new Date();
    const at = new Date(Math.min(Date.parse(request.at), now.getTime() + MAX_CLOCK_SKEW_MS));
    return ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attempts)
        .values({
          id: request.id,
          userId,
          itemId: item.id,
          conceptId: item.concept,
          correct: applied.result.correct,
          source: request.source,
          hintLevel: request.hintLevel,
          durationMs: request.durationMs,
          contentVersion: snapshot.number,
          misconception: applied.result.misconception,
          solutionShown: request.solutionShown,
          at,
          result: applied.result,
        })
        .onConflictDoNothing()
        .returning();
      // Someone recorded the same answer a moment ago: theirs stands.
      if (!row) {
        const [existing] = await tx.select().from(attempts).where(eq(attempts.id, request.id));
        return again(existing!);
      }
      await ctx.emit(tx, 'practice.attempt.recorded', {
        attemptId: request.id,
        userId,
        itemId: item.id,
        conceptId: item.concept,
        contentVersion: snapshot.number,
        correct: applied.result.correct,
        hintLevel: request.hintLevel,
        guessProbability: graded.guessProbability,
        explainedCorrectly: applied.result.explainedCorrectly,
        misconception: applied.result.misconception,
        durationMs: request.durationMs,
        source: request.source,
        solutionShown: request.solutionShown,
        xp: applied.xp,
        at: at.toISOString(),
      });
      // Progress may already have applied this answer (a crash before it was written down here):
      // the attempt row is the gate, so the events go out exactly once either way.
      if (applied.completion) {
        await ctx.emit(tx, 'practice.item.completed', {
          userId,
          itemId: item.id,
          cardId: applied.completion.cardId,
          conceptId: item.concept,
          firstTryCorrect: applied.completion.firstTryCorrect,
          hintLevel: applied.completion.hintLevel,
          durationMs: applied.completion.durationMs,
          expectedMs: applied.completion.expectedMs,
          solutionShown: applied.completion.solutionShown,
          at: applied.completion.at,
        });
      }
      return { attemptId: request.id, ...applied.result, duplicate: false };
    });
  }

  return {
    title: 'LogicPath Practice',
    description: 'Answering questions: grading, the record of attempts, and offline sync.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'practice',
        types: ['content.version.published', 'privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      app.post(
        '/v1/practice/attempts',
        {
          schema: {
            tags: ['practice'],
            summary: 'Answer a question',
            description:
              'The answer is graded on the server. Resending the same attempt id is safe.',
            security: [{ bearer: [] }],
            body: learning.AttemptRequest,
            response: { 200: learning.AttemptResult, 503: Problem, ...problems },
          },
        },
        async (req) => record(ctx, requireUser(req).id, req.body),
      );

      app.post(
        '/v1/practice/sync',
        {
          schema: {
            tags: ['practice'],
            summary: 'Send answers given while offline, in the order they were given',
            security: [{ bearer: [] }],
            body: learning.SyncRequest,
            response: { 200: learning.SyncResult, 503: Problem, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const results: learning.AttemptResult[] = [];
          // One after another: each answer builds on the learner's record as the last left it.
          for (const attempt of req.body.attempts) results.push(await record(ctx, me.id, attempt));
          return { results };
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const rows = await ctx.db
            .select()
            .from(attempts)
            .where(eq(attempts.userId, req.params.id))
            .orderBy(desc(attempts.createdAt))
            .limit(5000);
          return {
            service: 'practice',
            data: {
              attempts: rows.map(({ userId: _user, ...row }) => ({
                ...row,
                at: row.at.toISOString(),
                createdAt: row.createdAt.toISOString(),
              })),
            },
          };
        },
      );
    },
  };

  async function handle(ctx: Ctx, event: EventEnvelope) {
    if (event.type === 'content.version.published') {
      await cache(ctx).refresh();
      return;
    }
    await ctx.once('practice', event, async (tx) => {
      if (event.type === 'privacy.deletion.requested') {
        const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
        await tx.delete(attempts).where(eq(attempts.userId, userId));
        await ctx.emit(tx, 'privacy.deletion.completed', {
          requestId,
          userId,
          service: 'practice',
        });
      }
    });
  }
}
