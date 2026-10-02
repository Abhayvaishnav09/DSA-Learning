import { learning, type EventData, type EventEnvelope } from '@logicpath/contracts';
import type { ReviewCard } from '@logicpath/learning-engine';
import { dueQueue, emptyState, reviewSummary, scheduleCompletion } from '@logicpath/progress-rules';
import type { loadConfig } from '@logicpath/service-kit';
import {
  problems,
  requireInternal,
  requireUser,
  type ServiceContext,
  type ServiceDefinition,
} from '@logicpath/service-kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { cards, prefs } from './schema';

export const env = {};
export type ReviewConfig = ReturnType<typeof loadConfig<typeof env>>;
type Ctx = ServiceContext<ReviewConfig>;

const DEFAULT_ZONE = 'Asia/Kolkata';

/**
 * Spaced repetition: each question a learner finishes becomes a card whose next review is
 * scheduled by the shared FSRS rules. This service owns the cards and answers "what is due".
 */
export function reviewService(config: ReviewConfig): ServiceDefinition<ReviewConfig> {
  return {
    title: 'LogicPath Review',
    description: 'The review schedule: which questions are due, and when the others come back.',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    consumers: (ctx) => [
      {
        name: 'review',
        types: ['practice.item.completed', 'profile.updated', 'privacy.deletion.requested'],
        handle: (event) => handle(ctx, event),
      },
    ],
    routes: (app, ctx) => {
      const { db } = ctx;

      const load = async (userId: string) => {
        const rows = await db.select().from(cards).where(eq(cards.userId, userId));
        const byId: Record<string, ReviewCard> = {};
        const concepts = new Map<string, string>();
        for (const row of rows) {
          byId[row.cardId] = row.card;
          concepts.set(row.cardId, row.conceptId);
        }
        return { cards: byId, concepts };
      };
      const zoneOf = async (userId: string) => {
        const [row] = await db.select().from(prefs).where(eq(prefs.userId, userId));
        return row?.timeZone ?? DEFAULT_ZONE;
      };

      app.get(
        '/v1/reviews/due',
        {
          schema: {
            tags: ['review'],
            summary: 'Cards due now, most overdue first',
            security: [{ bearer: [] }],
            querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
            response: { 200: learning.DueQueue, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const { cards: mine, concepts } = await load(me.id);
          return dueQueue({ ...emptyState(), cards: mine }, new Date(), req.query.limit, (itemId) =>
            concepts.get(itemId),
          );
        },
      );

      app.get(
        '/v1/reviews/summary',
        {
          schema: {
            tags: ['review'],
            summary: 'How many cards are due, and when the next one is',
            security: [{ bearer: [] }],
            response: { 200: learning.ReviewSummary, ...problems },
          },
        },
        async (req) => {
          const me = requireUser(req);
          const { cards: mine } = await load(me.id);
          return reviewSummary({ ...emptyState(), cards: mine }, new Date(), await zoneOf(me.id));
        },
      );

      // ---------- used by the progress service ----------

      app.get(
        '/internal/users/:id/cards',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          return (await load(req.params.id)).cards;
        },
      );

      app.get(
        '/internal/users/:id/export',
        { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
        async (req) => {
          requireInternal(req, config);
          const mine = await load(req.params.id);
          return { service: 'review', data: { cards: mine.cards } };
        },
      );
    },
  };
}

async function handle(ctx: Ctx, event: EventEnvelope) {
  await ctx.once('review', event, async (tx) => {
    if (event.type === 'practice.item.completed') {
      const d = event.data as EventData<'practice.item.completed'>;
      const [existing] = await tx
        .select()
        .from(cards)
        .where(and(eq(cards.userId, d.userId), eq(cards.cardId, d.cardId)))
        .for('update');
      const next = scheduleCompletion(existing?.card, {
        cardId: d.cardId,
        firstTryCorrect: d.firstTryCorrect,
        hintLevel: d.hintLevel,
        durationMs: d.durationMs,
        expectedMs: d.expectedMs,
        solutionShown: d.solutionShown,
        at: d.at,
      });
      // A question finished after a newer review of the same card is history, not a new review.
      if (!next) return;
      await tx
        .insert(cards)
        .values({
          userId: d.userId,
          cardId: d.cardId,
          conceptId: d.conceptId,
          due: new Date(next.due),
          card: next,
        })
        .onConflictDoUpdate({
          target: [cards.userId, cards.cardId],
          set: {
            conceptId: d.conceptId,
            due: new Date(next.due),
            card: next,
            updatedAt: new Date(),
          },
        });
      await ctx.emit(tx, 'review.card.scheduled', {
        userId: d.userId,
        cardId: d.cardId,
        due: next.due,
      });
    } else if (event.type === 'profile.updated') {
      const d = event.data as EventData<'profile.updated'>;
      await tx
        .insert(prefs)
        .values({ userId: d.userId, timeZone: d.timeZone })
        .onConflictDoUpdate({ target: prefs.userId, set: { timeZone: d.timeZone } });
    } else if (event.type === 'privacy.deletion.requested') {
      const { userId, requestId } = event.data as EventData<'privacy.deletion.requested'>;
      await tx.delete(cards).where(eq(cards.userId, userId));
      await tx.delete(prefs).where(eq(prefs.userId, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', { requestId, userId, service: 'review' });
    }
  });
}
