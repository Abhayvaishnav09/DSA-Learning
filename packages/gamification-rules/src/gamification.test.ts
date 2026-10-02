import { describe, expect, it } from 'vitest';
import {
  BADGES,
  LEAGUE_TIERS,
  addDays,
  demoteCount,
  emptyStats,
  istDate,
  levelFloorXp,
  levelFor,
  levelInfo,
  moveTier,
  newBadges,
  promoteCount,
  rank,
  startOfIstDay,
  statsAfterAttempt,
  weekStart,
  xpForAttempt,
  zoneFor,
} from './index';

const attempt = {
  correct: true,
  hintLevel: 0,
  source: 'lesson' as const,
  explainedCorrectly: null,
  solutionShown: false,
};

describe('xpForAttempt', () => {
  it('pays less the more help was needed', () => {
    expect([0, 1, 2, 3].map((hintLevel) => xpForAttempt({ ...attempt, hintLevel }))).toEqual([
      10, 7, 5, 3,
    ]);
  });
  it('adds a bonus for understanding why, and for reviewing', () => {
    expect(xpForAttempt({ ...attempt, explainedCorrectly: true })).toBe(13);
    expect(xpForAttempt({ ...attempt, source: 'review' })).toBe(12);
  });
  it('pays nothing for wrong answers or a shown solution, and a little for predicting', () => {
    expect(xpForAttempt({ ...attempt, correct: false })).toBe(0);
    expect(xpForAttempt({ ...attempt, solutionShown: true })).toBe(0);
    expect(xpForAttempt({ ...attempt, source: 'predict', correct: false })).toBe(3);
  });
});

describe('levels', () => {
  it('grows slower and slower', () => {
    expect([1, 2, 3, 4].map(levelFloorXp)).toEqual([0, 100, 300, 600]);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(99)).toBe(1);
    expect(levelFor(100)).toBe(2);
    expect(levelFor(599)).toBe(3);
  });
  it('says where the current level starts and the next begins', () => {
    expect(levelInfo(150)).toEqual({ level: 2, levelFloorXp: 100, nextLevelXp: 300 });
  });
});

describe('badges', () => {
  it('has a unique id and both languages for each', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const badge of BADGES) {
      expect(badge.title['hi-Latn']).not.toBe('');
      expect(badge.description.en).not.toBe('');
    }
  });
  it('awards each badge once, as soon as the stats qualify', () => {
    const stats = { ...emptyStats(), correctTotal: 1, lessonsCompleted: 1 };
    expect(newBadges(stats, new Set())).toEqual(['first-answer', 'first-lesson']);
    expect(newBadges(stats, new Set(['first-answer']))).toEqual(['first-lesson']);
    expect(newBadges(emptyStats(), new Set())).toEqual([]);
  });
  it('rewards streaks in steps', () => {
    const owned = new Set<string>();
    expect(newBadges({ ...emptyStats(), longestStreak: 7 }, owned)).toEqual([
      'streak-3',
      'streak-7',
    ]);
  });
});

describe('leagues', () => {
  it('promotes a third of small groups and five of big ones', () => {
    expect([3, 6, 12, 30].map(promoteCount)).toEqual([1, 2, 4, 5]);
    expect([3, 9, 12, 30].map(demoteCount)).toEqual([0, 0, 4, 5]);
  });
  it('puts learners in zones, with no promotion from the top or demotion from the bottom', () => {
    expect(zoneFor(1, 30, 'silver')).toBe('promote');
    expect(zoneFor(15, 30, 'silver')).toBe('stay');
    expect(zoneFor(30, 30, 'silver')).toBe('demote');
    expect(zoneFor(1, 30, 'diamond')).toBe('stay');
    expect(zoneFor(30, 30, 'bronze')).toBe('stay');
    expect(zoneFor(4, 4, 'silver')).toBe('stay');
  });
  it('moves between tiers within the ladder', () => {
    expect(moveTier('bronze', 'promote')).toBe('silver');
    expect(moveTier('bronze', 'demote')).toBe('bronze');
    expect(moveTier('diamond', 'promote')).toBe('diamond');
    expect(moveTier('gold', 'stay')).toBe('gold');
    expect(LEAGUE_TIERS).toHaveLength(5);
  });
  it('ranks by XP and breaks ties the same way everywhere', () => {
    const ranked = rank([
      { userId: 'b', xp: 10 },
      { userId: 'a', xp: 10 },
      { userId: 'c', xp: 30 },
    ]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });
  it('finds the Monday of a week and counts days', () => {
    expect(weekStart('2026-10-02')).toBe('2026-09-28'); // a Friday
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // Sunday
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
  });
});

describe('counters after an answer', () => {
  const facts = { correct: true, hintLevel: 0, source: 'lesson' as const, solutionShown: false };

  it('counts right answers and keeps a clean run going while no hint is used', () => {
    let stats = emptyStats();
    stats = statsAfterAttempt(stats, facts);
    stats = statsAfterAttempt(stats, facts);
    expect(stats).toMatchObject({ correctTotal: 2, unaidedRun: 2, reviewsDone: 0 });
    stats = statsAfterAttempt(stats, { ...facts, hintLevel: 1 });
    expect(stats).toMatchObject({ correctTotal: 3, unaidedRun: 0 });
  });

  it('counts reviews, and a miss ends the run without counting', () => {
    const run = { ...emptyStats(), unaidedRun: 4 };
    expect(statsAfterAttempt(run, { ...facts, source: 'review' })).toMatchObject({
      reviewsDone: 1,
      unaidedRun: 5,
    });
    expect(statsAfterAttempt(run, { ...facts, correct: false })).toMatchObject({
      correctTotal: 0,
      unaidedRun: 0,
    });
  });

  it('ignores predictions and shown solutions, and never changes its input', () => {
    const run = { ...emptyStats(), unaidedRun: 4 };
    expect(statsAfterAttempt(run, { ...facts, source: 'predict' })).toEqual(run);
    expect(statsAfterAttempt(run, { ...facts, source: 'predict', correct: false })).toEqual(run);
    expect(statsAfterAttempt(run, { ...facts, solutionShown: true })).toEqual(run);
    expect(run.unaidedRun).toBe(4);
  });
});

describe('India time', () => {
  it('turns over at 18:30 UTC, when it is midnight in India', () => {
    expect(istDate(new Date('2026-10-02T18:29:59Z'))).toBe('2026-10-02');
    expect(istDate(new Date('2026-10-02T18:30:00Z'))).toBe('2026-10-03');
  });

  it('knows the moment a day starts', () => {
    expect(startOfIstDay('2026-10-03').toISOString()).toBe('2026-10-02T18:30:00.000Z');
    expect(istDate(startOfIstDay('2026-10-03'))).toBe('2026-10-03');
  });
});
