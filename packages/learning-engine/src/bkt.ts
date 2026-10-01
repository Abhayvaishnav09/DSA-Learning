/**
 * Bayesian Knowledge Tracing (docs/01-learning-science.md §3, ADR-0005).
 * One probability per learner per concept: "how likely is it that they know this?"
 */

export interface BktParams {
  /** Probability the learner knows the concept before practice. */
  pInit: number;
  /** Probability of learning it on each practice opportunity. */
  pLearn: number;
  /** Probability of answering wrong despite knowing it. */
  pSlip: number;
  /** Probability of answering right without knowing it. */
  pGuess: number;
}

export const DEFAULT_BKT: BktParams = { pInit: 0.1, pLearn: 0.2, pSlip: 0.1, pGuess: 0.2 };

export type HintLevel = 0 | 1 | 2 | 3;

export interface Evidence {
  correct: boolean;
  /** Highest hint level seen before answering. Each level weakens the evidence of a correct answer. */
  hintLevel: HintLevel;
  /** Overrides pGuess, e.g. 1/options for multiple choice. */
  guessProbability?: number;
  /** Result of the "explain why" check. A right answer with a wrong reason is treated as half a guess. */
  explainedCorrectly?: boolean;
}

/** Each hint level removes 30% of the weight of a correct answer. */
export const HINT_PENALTY = 0.3;

const P_MIN = 0.001;
const P_MAX = 0.999;

const clamp = (p: number) => Math.min(P_MAX, Math.max(P_MIN, p));

function posterior(p: number, correct: boolean, slip: number, guess: number): number {
  if (correct) {
    const known = p * (1 - slip);
    return known / (known + (1 - p) * guess);
  }
  const known = p * slip;
  return known / (known + (1 - p) * (1 - guess));
}

/** Returns the updated probability that the learner knows the concept. */
export function updateKnowledge(
  p: number,
  evidence: Evidence,
  params: BktParams = DEFAULT_BKT,
): number {
  const guess = evidence.guessProbability ?? params.pGuess;
  const prior = clamp(p);
  const ifCorrect = posterior(prior, true, params.pSlip, guess);
  const ifWrong = posterior(prior, false, params.pSlip, guess);

  let observed: number;
  if (!evidence.correct) {
    observed = ifWrong;
  } else {
    // A correct answer after hints is weaker evidence: blend towards "no new information".
    const weight = Math.max(0, 1 - HINT_PENALTY * evidence.hintLevel);
    observed = weight * ifCorrect + (1 - weight) * prior;
    if (evidence.explainedCorrectly === false) {
      observed = 0.5 * observed + 0.5 * ifWrong;
    }
  }

  return clamp(observed + (1 - observed) * params.pLearn);
}
