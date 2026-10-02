import type { BundleConcept } from '@logicpath/content-schema';
import {
  conceptStatus,
  dueCards,
  nextDue,
  type ConceptStatus,
  type ReviewCard,
} from '@logicpath/learning-engine';
import { useMemo } from 'react';
import { conceptGraph, concepts, getLesson } from '@/shared/content/bundle';
import { now } from '@/shared/lib/clock';
import { useProgress, type LessonProgress } from './store';

export interface ConceptView {
  concept: BundleConcept;
  status: ConceptStatus;
  /** 0 to 100. */
  knowledge: number;
  minutes: number | null;
}

export function useConceptViews(): ConceptView[] {
  const states = useProgress((s) => s.concepts);
  return useMemo(
    () =>
      concepts.map((concept) => ({
        concept,
        status: conceptStatus(conceptGraph.get(concept.id)!, states, conceptGraph),
        knowledge: Math.round((states[concept.id]?.pKnown ?? 0) * 100),
        minutes: getLesson(concept.id)?.minutes ?? null,
      })),
    [states],
  );
}

export function useReviewQueue(): { due: ReviewCard[]; nextDueAt: string | null } {
  const cards = useProgress((s) => s.cards);
  return useMemo(() => {
    const all = Object.values(cards);
    return { due: dueCards(all, now()), nextDueAt: nextDue(all) };
  }, [cards]);
}

/** The lesson to suggest next: one in progress, else the first open one. */
export function useUpNext(): { view: ConceptView; lesson: LessonProgress | undefined } | null {
  const views = useConceptViews();
  const lessons = useProgress((s) => s.lessons);
  const view =
    views.find((v) => v.status === 'learning' && !lessons[v.concept.id]?.completedAt) ??
    views.find((v) => v.status === 'available') ??
    views.find((v) => v.status === 'learning');
  return view ? { view, lesson: lessons[view.concept.id] } : null;
}
