import type { learning } from '@logicpath/contracts';
import {
  DAILY_REVIEW_CAP,
  conceptStatus,
  dueCards,
  localDate,
  nextDue,
  type GraphConcept,
} from '@logicpath/learning-engine';
import type { LearnerState } from './state';

export function buildGraph(concepts: readonly GraphConcept[]): Map<string, GraphConcept> {
  return new Map(concepts.map((c) => [c.id, c]));
}

export function progressMap(
  state: LearnerState,
  graph: ReadonlyMap<string, GraphConcept>,
  contentVersion: number,
  goalMinutes: number,
  now: Date,
  timeZone: string,
): learning.ProgressMap {
  const today = localDate(now, timeZone);
  const day = state.days[today];
  return {
    contentVersion,
    concepts: [...graph.values()].map((concept) => {
      const known = state.concepts[concept.id];
      return {
        conceptId: concept.id,
        status: conceptStatus(concept, state.concepts, graph),
        pKnown: known?.pKnown ?? 0,
        attempts: known?.attempts ?? 0,
        masteredAt: state.masteredAt[concept.id] ?? null,
      };
    }),
    lessons: Object.values(state.lessons),
    streak: state.streak,
    today: {
      localDate: today,
      minutes: Math.round((day?.minutes ?? 0) * 10) / 10,
      goalMinutes,
      itemsCompleted: day?.items ?? 0,
      lessonsCompleted: day?.lessons ?? 0,
    },
  };
}

export function dueQueue(
  state: LearnerState,
  now: Date,
  limit: number,
  conceptOf: (itemId: string) => string | undefined,
): learning.DueQueue {
  const all = Object.values(state.cards);
  const dueNow = dueCards(all, now, Number.POSITIVE_INFINITY);
  return {
    items: dueNow.slice(0, Math.min(limit, DAILY_REVIEW_CAP)).map((card) => ({
      cardId: card.itemId,
      itemId: card.itemId,
      conceptId: conceptOf(card.itemId) ?? '',
      due: card.due,
      state: card.state,
      reps: card.reps,
      lapses: card.lapses,
    })),
    dueCount: dueNow.length,
    nextDueAt: nextDue(all.filter((c) => c.due > now.toISOString())),
  };
}

export function reviewSummary(
  state: LearnerState,
  now: Date,
  timeZone: string,
): learning.ReviewSummary {
  const cards = Object.values(state.cards);
  const nowIso = now.toISOString();
  const today = localDate(now, timeZone);
  const dueNow = cards.filter((c) => c.due <= nowIso).length;
  const dueToday = cards.filter(
    (c) => c.due <= nowIso || localDate(new Date(c.due), timeZone) === today,
  ).length;
  return {
    dueNow,
    dueToday,
    total: cards.length,
    nextDueAt: nextDue(cards.filter((c) => c.due > nowIso)),
  };
}

/** The slice of state the apps' own engine keeps, for a new device (contract: EngineState). */
export function engineState(state: LearnerState): learning.EngineState {
  return {
    concepts: state.concepts,
    cards: state.cards,
    lessons: state.lessons,
    streak: state.streak,
    masteredAt: state.masteredAt,
  };
}
