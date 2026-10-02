import { LESSON_COMPLETE_XP } from '@logicpath/gamification-rules';
import { localDate } from '@logicpath/learning-engine';
import type { XpEvent } from './attempt';
import { addToDay, nextStreak, type LearnerState, type LessonBeat } from './state';

export function saveLessonPosition(
  state: LearnerState,
  conceptId: string,
  beat: LessonBeat,
  practiceIndex: number,
  now: Date,
): LearnerState {
  const existing = state.lessons[conceptId];
  // A finished lesson stays finished: replaying it doesn't reopen it.
  return {
    ...state,
    lessons: {
      ...state.lessons,
      [conceptId]: {
        conceptId,
        beat,
        practiceIndex,
        startedAt: existing?.startedAt ?? now.toISOString(),
        completedAt: existing?.completedAt ?? null,
      },
    },
  };
}

export function completeLesson(
  state: LearnerState,
  conceptId: string,
  now: Date,
  timeZone: string,
): { state: LearnerState; xp: XpEvent[]; firstTime: boolean } {
  const existing = state.lessons[conceptId];
  const firstTime = !existing?.completedAt;
  const at = now.toISOString();
  const day = localDate(now, timeZone);
  const next: LearnerState = {
    ...state,
    lessons: {
      ...state.lessons,
      [conceptId]: {
        conceptId,
        beat: 'recap',
        practiceIndex: 0,
        startedAt: existing?.startedAt ?? at,
        completedAt: existing?.completedAt ?? at,
      },
    },
  };
  if (!firstTime) return { state: next, xp: [], firstTime };
  next.days = addToDay(state.days, day, { lessons: 1 });
  next.streak = nextStreak(state.streak, day);
  next.stats = {
    ...state.stats,
    lessonsCompleted: state.stats.lessonsCompleted + 1,
    longestStreak: Math.max(state.stats.longestStreak, next.streak.longest),
  };
  return { state: next, xp: [{ amount: LESSON_COMPLETE_XP, reason: 'lesson' }], firstTime };
}
