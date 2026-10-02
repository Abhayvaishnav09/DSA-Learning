import type { LearnerStats } from '@logicpath/gamification-rules';
import { emptyStats } from '@logicpath/gamification-rules';
import { daysBetween, type ConceptState, type ReviewCard } from '@logicpath/learning-engine';

/** What a learner has done on one local day. */
export interface DayTotals {
  minutes: number;
  items: number;
  lessons: number;
  /** The daily-goal bonus is paid once a day. */
  goalPaid: boolean;
}

export type LessonBeat = 'story' | 'see' | 'predict' | 'practice' | 'recap';

export interface LessonRecord {
  conceptId: string;
  beat: LessonBeat;
  practiceIndex: number;
  startedAt: string;
  completedAt: string | null;
}

export interface Streak {
  current: number;
  longest: number;
  lastActiveOn: string | null;
}

/**
 * Everything one learner has learned. The services keep it per user; the apps keep the same
 * thing on the device (learning-engine's state) and the two agree because they run the same rules.
 */
export interface LearnerState {
  concepts: Record<string, ConceptState>;
  /** Keyed by the card's item (variations share the original's card). */
  cards: Record<string, ReviewCard>;
  lessons: Record<string, LessonRecord>;
  streak: Streak;
  masteredAt: Record<string, string>;
  days: Record<string, DayTotals>;
  stats: LearnerStats;
}

export const emptyState = (): LearnerState => ({
  concepts: {},
  cards: {},
  lessons: {},
  streak: { current: 0, longest: 0, lastActiveOn: null },
  masteredAt: {},
  days: {},
  stats: emptyStats(),
});

/** Only the last weeks of daily totals are kept. */
const KEEP_DAYS = 60;

export function nextStreak(streak: Streak, today: string): Streak {
  // Attempts synced late from an earlier day never move the streak backwards.
  if (streak.lastActiveOn !== null && today <= streak.lastActiveOn) return streak;
  const continues = streak.lastActiveOn !== null && daysBetween(streak.lastActiveOn, today) === 1;
  const current = continues ? streak.current + 1 : 1;
  return { current, longest: Math.max(streak.longest, current), lastActiveOn: today };
}

export function addToDay(
  days: Record<string, DayTotals>,
  date: string,
  add: Partial<Omit<DayTotals, 'goalPaid'>>,
): Record<string, DayTotals> {
  const before = days[date] ?? { minutes: 0, items: 0, lessons: 0, goalPaid: false };
  const next = {
    ...days,
    [date]: {
      ...before,
      minutes: before.minutes + (add.minutes ?? 0),
      items: before.items + (add.items ?? 0),
      lessons: before.lessons + (add.lessons ?? 0),
    },
  };
  const dates = Object.keys(next).sort();
  for (const old of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete next[old];
  return next;
}
