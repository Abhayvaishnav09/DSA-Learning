/** XP, levels and the daily goal bonus (docs/01-learning-science.md §6: rewards follow effort, not luck). */

export interface XpAttempt {
  correct: boolean;
  hintLevel: number;
  source: 'lesson' | 'predict' | 'review';
  explainedCorrectly: boolean | null;
  solutionShown: boolean;
}

/** XP for a right answer, by how much help it needed. */
const BY_HINT_LEVEL = [10, 7, 5, 3] as const;
const EXPLAIN_BONUS = 3;
const REVIEW_BONUS = 2;
/** Predicting is rewarded for trying, not for being right: it happens before the lesson teaches it. */
const PREDICT_XP = 3;

export const LESSON_COMPLETE_XP = 20;
export const DAILY_GOAL_XP = 15;
export const STREAK_MILESTONES: Readonly<Record<number, number>> = { 7: 30, 30: 100, 100: 300 };

export function xpForAttempt(attempt: XpAttempt): number {
  if (attempt.solutionShown) return 0;
  if (attempt.source === 'predict') return PREDICT_XP;
  if (!attempt.correct) return 0;
  const base = BY_HINT_LEVEL[Math.min(attempt.hintLevel, 3)] ?? 3;
  return (
    base +
    (attempt.explainedCorrectly ? EXPLAIN_BONUS : 0) +
    (attempt.source === 'review' ? REVIEW_BONUS : 0)
  );
}

/** Cumulative XP needed to reach a level: 0, 100, 300, 600, 1000, … (50·L·(L−1)). */
export const levelFloorXp = (level: number): number => 50 * level * (level - 1);

export function levelFor(xp: number): number {
  let level = 1;
  while (levelFloorXp(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelInfo {
  level: number;
  levelFloorXp: number;
  nextLevelXp: number;
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelFor(xp);
  return { level, levelFloorXp: levelFloorXp(level), nextLevelXp: levelFloorXp(level + 1) };
}
