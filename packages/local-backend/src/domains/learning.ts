import type { LocalContext, LocalHandler } from '@logicpath/api-client/local';
import type { ContentBundle } from '@logicpath/content-schema';
import type { learning, ParamsOf } from '@logicpath/contracts';
import {
  InvalidAnswerError,
  buildGraph,
  completeLesson,
  dueQueue,
  engineState,
  processAttempt,
  progressMap,
  reviewSummary,
  saveLessonPosition,
} from '@logicpath/progress-rules';
import type { LocalDb } from '../db';
import { badRequest, me, notFound } from '../util';
import { liveVersion } from './content';
import { awardXp, goalOf, learnerOf, tzOf } from './engage';

const graphOf = (bundle: ContentBundle) => buildGraph(bundle.concepts);

/** Practice, progress and review: what the learner has done and what is due next. */
export function learningHandlers(db: LocalDb): Record<string, LocalHandler> {
  function record(ctx: LocalContext, request: learning.AttemptRequest): learning.AttemptResult {
    const user = me(ctx);
    const live = liveVersion(db);
    const bundle = live.bundle;
    const graph = graphOf(bundle);

    const seen = db.t.attempts.find((a) => a.id === request.id);
    if (seen) {
      // Resending an attempt is safe: nothing is counted twice.
      const state = learnerOf(db, user.id);
      const concept = graph.get(seen.conceptId);
      return {
        attemptId: seen.id,
        correct: seen.correct,
        misconception: seen.misconception,
        parts: null,
        explainedCorrectly: null,
        xpAwarded: 0,
        concept: {
          conceptId: seen.conceptId,
          pKnown: state.concepts[seen.conceptId]?.pKnown ?? 0,
          status: concept && state.concepts[seen.conceptId] ? 'learning' : 'available',
        },
        duplicate: true,
      };
    }

    const item = bundle.items[request.itemId];
    if (!item) throw notFound('Question');
    let outcome;
    try {
      outcome = processAttempt(learnerOf(db, user.id), request, {
        item,
        graph,
        now: ctx.now,
        timeZone: tzOf(db, user.id),
        goalMinutes: goalOf(db, user.id),
      });
    } catch (error) {
      if (error instanceof InvalidAnswerError) throw badRequest(error.message);
      throw error;
    }
    db.t.learners[user.id] = outcome.state;
    db.t.attempts.push({
      id: request.id,
      userId: user.id,
      itemId: item.id,
      conceptId: item.concept,
      correct: outcome.result.correct,
      misconception: outcome.result.misconception,
      hintLevel: request.hintLevel,
      durationMs: request.durationMs,
      source: request.source,
      at: request.at,
    });
    // The log is for the dashboards: keep it bounded so the browser's storage lasts.
    if (db.t.attempts.length > 4000) db.t.attempts.splice(0, db.t.attempts.length - 4000);
    awardXp(db, user.id, outcome.xp, ctx.now);
    db.touch();
    return { attemptId: request.id, ...outcome.result, duplicate: false };
  }

  const progressFor = (ctx: LocalContext): learning.ProgressMap => {
    const user = me(ctx);
    return progressMap(
      learnerOf(db, user.id),
      graphOf(liveVersion(db).bundle),
      liveVersion(db).number,
      goalOf(db, user.id),
      ctx.now,
      tzOf(db, user.id),
    );
  };

  const lessonState = (userId: string, conceptId: string): learning.LessonState => {
    const lesson = learnerOf(db, userId).lessons[conceptId]!;
    return {
      conceptId,
      beat: lesson.beat,
      practiceIndex: lesson.practiceIndex,
      startedAt: lesson.startedAt,
      completedAt: lesson.completedAt,
    };
  };

  return {
    'practice.attempt': (ctx, { body }) => record(ctx, body as learning.AttemptRequest),
    'practice.sync': (ctx, { body }) => ({
      results: (body as learning.SyncRequest).attempts.map((attempt) => record(ctx, attempt)),
    }),

    'progress.get': (ctx) => progressFor(ctx),
    'progress.state': (ctx) => engineState(learnerOf(db, me(ctx).id)),
    'progress.lesson.position': (ctx, { params, body }) => {
      const user = me(ctx);
      const { conceptId } = params as ParamsOf<'progress.lesson.position'>;
      if (!liveVersion(db).bundle.lessons[conceptId]) throw notFound('Lesson');
      const { beat, practiceIndex } = body as learning.LessonPosition;
      db.t.learners[user.id] = saveLessonPosition(
        learnerOf(db, user.id),
        conceptId,
        beat,
        practiceIndex ?? 0,
        ctx.now,
      );
      db.touch();
      return lessonState(user.id, conceptId);
    },
    'progress.lesson.complete': (ctx, { params }) => {
      const user = me(ctx);
      const { conceptId } = params as ParamsOf<'progress.lesson.complete'>;
      if (!liveVersion(db).bundle.lessons[conceptId]) throw notFound('Lesson');
      const done = completeLesson(learnerOf(db, user.id), conceptId, ctx.now, tzOf(db, user.id));
      db.t.learners[user.id] = done.state;
      awardXp(db, user.id, done.xp, ctx.now);
      db.touch();
      return lessonState(user.id, conceptId);
    },

    'reviews.due': (ctx, { query }) => {
      const user = me(ctx);
      const { items } = liveVersion(db).bundle;
      return dueQueue(
        learnerOf(db, user.id),
        ctx.now,
        Number((query as { limit?: number }).limit ?? 20),
        (itemId) => items[itemId]?.concept,
      );
    },
    'reviews.summary': (ctx) => {
      const user = me(ctx);
      return reviewSummary(learnerOf(db, user.id), ctx.now, tzOf(db, user.id));
    },
  };
}
