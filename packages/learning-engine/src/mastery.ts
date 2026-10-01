import { DEFAULT_BKT, updateKnowledge, type BktParams, type Evidence } from './bkt';
import { localDate } from './dates';

/** A concept counts as known above this probability (docs/01-learning-science.md §3). */
export const MASTERY_THRESHOLD = 0.95;

/** Knowledge is capped here when a mastered concept is forgotten in a review. */
export const RELEARN_CAP = 0.7;

export type ConceptStatus = 'locked' | 'available' | 'learning' | 'mastered';

export interface ConceptState {
  conceptId: string;
  pKnown: number;
  attempts: number;
  correct: number;
  /** Learner-local date of the first practice. */
  firstPracticedOn: string;
  /** Learner-local date of the first unaided correct answer on a later day than the first practice. */
  recallPassedOn: string | null;
}

export interface AttemptEvidence extends Evidence {
  conceptId: string;
  at: Date;
}

export interface MasteryOptions {
  timeZone: string;
  params?: BktParams;
}

export function isMastered(state: ConceptState | undefined): boolean {
  return !!state && state.pKnown >= MASTERY_THRESHOLD && state.recallPassedOn !== null;
}

/** Pure reducer: concept state after one attempt. */
export function applyAttempt(
  previous: ConceptState | undefined,
  attempt: AttemptEvidence,
  { timeZone, params = DEFAULT_BKT }: MasteryOptions,
): ConceptState {
  const today = localDate(attempt.at, timeZone);
  const base: ConceptState = previous ?? {
    conceptId: attempt.conceptId,
    pKnown: params.pInit,
    attempts: 0,
    correct: 0,
    firstPracticedOn: today,
    recallPassedOn: null,
  };

  const wasMastered = isMastered(base);
  let pKnown = updateKnowledge(base.pKnown, attempt, params);

  let recallPassedOn = base.recallPassedOn;
  const unaidedCorrect = attempt.correct && attempt.hintLevel === 0;
  if (unaidedCorrect && recallPassedOn === null && today > base.firstPracticedOn) {
    recallPassedOn = today;
  }
  // BKT saturates near 1, so one miss barely moves it. Forgetting a mastered concept must
  // send it back into practice, and mastery has to be re-proven on a later day.
  if (wasMastered && !attempt.correct) {
    pKnown = Math.min(pKnown, RELEARN_CAP);
    recallPassedOn = null;
  }

  return {
    ...base,
    pKnown,
    attempts: base.attempts + 1,
    correct: base.correct + (attempt.correct ? 1 : 0),
    recallPassedOn,
  };
}

export interface GraphConcept {
  id: string;
  prerequisites: readonly string[];
  /** Concepts without published content can't block anything (there is nothing to master yet). */
  published: boolean;
}

export function conceptStatus(
  concept: GraphConcept,
  states: Readonly<Record<string, ConceptState | undefined>>,
  graph: ReadonlyMap<string, GraphConcept>,
): ConceptStatus {
  if (!concept.published) return 'locked';
  const state = states[concept.id];
  if (isMastered(state)) return 'mastered';
  if (state) return 'learning';
  const blocked = concept.prerequisites.some((id) => {
    const prerequisite = graph.get(id);
    return prerequisite?.published === true && !isMastered(states[id]);
  });
  return blocked ? 'locked' : 'available';
}
