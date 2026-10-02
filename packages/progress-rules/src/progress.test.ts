import bundleJson from '@logicpath/content/bundle.json';
import type { ContentBundle, Item } from '@logicpath/content-schema';
import type { learning } from '@logicpath/contracts';
import { correctAnswer } from '@logicpath/grader';
import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  cardKey,
  completeLesson,
  dueQueue,
  emptyState,
  engineState,
  InvalidAnswerError,
  nextStreak,
  processAttempt,
  progressMap,
  reviewSummary,
  saveLessonPosition,
} from './index';

const bundle = bundleJson as unknown as ContentBundle;
const graph = buildGraph(bundle.concepts);
const item = bundle.items['loops.counter.how-many']!; // has a "why" check
const plain = Object.values(bundle.items).find(
  (i) => i.concept === 'loops.counter' && !i.explainWhy,
)!;
const NOW = new Date('2026-10-02T10:00:00Z');
const ctx = (it: Item, now = NOW) => ({
  item: it,
  graph,
  now,
  timeZone: 'Asia/Kolkata',
  goalMinutes: 10,
});

const request = (
  it: Item,
  patch: Partial<learning.AttemptRequest> = {},
): learning.AttemptRequest => ({
  id: crypto.randomUUID(),
  itemId: it.id,
  answer: correctAnswer(it) as learning.AttemptRequest['answer'],
  hintLevel: 0,
  durationMs: 20_000,
  source: 'lesson',
  explainOption: null,
  solutionShown: false,
  attemptNo: 1,
  at: NOW.toISOString(),
  ...patch,
});
const wrong = (it: Item): learning.AttemptRequest['answer'] => {
  const right = correctAnswer(it);
  switch (right.type) {
    case 'mcq':
      return { type: 'mcq', option: right.option === 0 ? 1 : 0 };
    case 'arrange-steps':
      return { type: 'arrange-steps', order: [...right.order].reverse() };
    case 'fill-blank':
      return { type: 'fill-blank', blanks: right.blanks.map(() => 'zzz') };
    case 'predict-output':
      return { type: 'predict-output', text: 'zzz' };
    default:
      return right as learning.AttemptRequest['answer'];
  }
};

describe('processAttempt', () => {
  it('grades on the server side, moves mastery and pays XP for a right answer', () => {
    const out = processAttempt(emptyState(), request(plain), ctx(plain));
    expect(out.result.correct).toBe(true);
    expect(out.concluded).toBe(true);
    expect(out.state.concepts['loops.counter']?.attempts).toBe(1);
    expect(out.result.concept.status).toBe('learning');
    expect(out.xp[0]).toEqual({ amount: 10, reason: 'attempt' });
    expect(out.state.cards[cardKey(plain)]?.reps).toBe(1);
    expect(out.state.stats.correctTotal).toBe(1);
  });

  it('does not conclude a right answer until the "why" check is answered', () => {
    const before = processAttempt(emptyState(), request(item), ctx(item));
    expect(before.concluded).toBe(false);
    expect(before.state.cards[cardKey(item)]).toBeUndefined();
    const after = processAttempt(emptyState(), request(item, { explainOption: 0 }), ctx(item));
    expect(after.concluded).toBe(true);
    expect(after.result.explainedCorrectly).not.toBeNull();
  });

  it('a wrong answer pays nothing, resets the clean run and schedules nothing', () => {
    const start = { ...emptyState(), stats: { ...emptyState().stats, unaidedRun: 4 } };
    const out = processAttempt(start, request(plain, { answer: wrong(plain) }), ctx(plain));
    expect(out.result.correct).toBe(false);
    expect(out.xp).toEqual([]);
    expect(out.concluded).toBe(false);
    expect(out.state.stats.unaidedRun).toBe(0);
    expect(out.state.concepts['loops.counter']?.attempts).toBe(1);
  });

  it('rejects an answer of the wrong kind instead of grading it', () => {
    expect(() =>
      processAttempt(
        emptyState(),
        request(plain, { answer: { type: 'predict-output', text: 'x' } }),
        ctx(plain),
      ),
    ).toThrow(InvalidAnswerError);
  });

  it('predictions are not evidence of knowledge and earn a little XP', () => {
    const out = processAttempt(emptyState(), request(plain, { source: 'predict' }), ctx(plain));
    expect(out.state.concepts['loops.counter']).toBeUndefined();
    expect(out.xp).toEqual([{ amount: 3, reason: 'attempt' }]);
    expect(out.concluded).toBe(false);
  });

  it('a shown solution schedules an early review and gives no credit', () => {
    const out = processAttempt(emptyState(), request(plain, { solutionShown: true }), ctx(plain));
    expect(out.xp).toEqual([]);
    expect(out.state.concepts['loops.counter']).toBeUndefined();
    expect(out.state.cards[cardKey(plain)]).toBeDefined();
    expect(out.concluded).toBe(true);
  });

  it('a later try is graded as harder than a first try', () => {
    const first = processAttempt(emptyState(), request(plain), ctx(plain));
    const retry = processAttempt(emptyState(), request(plain, { attemptNo: 3 }), ctx(plain));
    expect(retry.state.cards[cardKey(plain)]!.due <= first.state.cards[cardKey(plain)]!.due).toBe(
      true,
    );
  });

  it('pays the daily goal once and counts reviews', () => {
    let state = emptyState();
    const long = { durationMs: 5 * 60_000 };
    const a = processAttempt(state, request(plain, long), ctx(plain));
    state = a.state;
    const b = processAttempt(state, request(plain, { ...long, source: 'review' }), ctx(plain));
    expect(b.xp.map((e) => e.reason)).toEqual(['attempt', 'daily-goal']);
    state = b.state;
    const c = processAttempt(state, request(plain, long), ctx(plain));
    expect(c.xp.map((e) => e.reason)).toEqual(['attempt']);
    expect(c.state.stats.reviewsDone).toBe(1);
    expect(c.state.days['2026-10-02']?.goalPaid).toBe(true);
  });

  it('keeps a streak across days and pays the weekly milestone', () => {
    let state = emptyState();
    let last = processAttempt(state, request(plain), ctx(plain));
    for (let day = 3; day <= 8; day++) {
      const at = new Date(`2026-10-0${day}T10:00:00Z`);
      state = last.state;
      last = processAttempt(state, request(plain, { at: at.toISOString() }), ctx(plain, at));
    }
    expect(last.state.streak.current).toBe(7);
    expect(last.xp.some((e) => e.reason === 'streak' && e.amount === 30)).toBe(true);
    expect(last.state.stats.longestStreak).toBe(7);
  });

  it('ignores a device clock set far ahead and attempts that arrive late', () => {
    const future = processAttempt(
      emptyState(),
      request(plain, { at: '2030-01-01T00:00:00Z' }),
      ctx(plain),
    );
    expect(future.state.streak.lastActiveOn).toBe('2026-10-02');
    const late = processAttempt(
      future.state,
      request(plain, { at: '2026-09-20T10:00:00Z' }),
      ctx(plain),
    );
    expect(late.state.streak.lastActiveOn).toBe('2026-10-02');
    expect(late.state.streak.current).toBe(1);
  });

  it('notices when a concept becomes mastered', () => {
    let state = emptyState();
    let mastered = false;
    for (let i = 0; i < 40 && !mastered; i++) {
      // Day 1 practice, then correct unaided recall on later days.
      const at = new Date(NOW.getTime() + Math.floor(i / 5) * 86_400_000);
      const out = processAttempt(state, request(plain, { at: at.toISOString() }), ctx(plain, at));
      state = out.state;
      mastered = out.masteredNow;
    }
    expect(mastered).toBe(true);
    expect(state.masteredAt['loops.counter']).toBeDefined();
    expect(state.stats.conceptsMastered).toBe(1);
  });
});

describe('lessons', () => {
  it('saves the place and finishes once, paying XP the first time only', () => {
    let state = saveLessonPosition(emptyState(), 'loops.counter', 'see', 0, NOW);
    expect(state.lessons['loops.counter']?.beat).toBe('see');
    const done = completeLesson(state, 'loops.counter', NOW, 'Asia/Kolkata');
    expect(done.firstTime).toBe(true);
    expect(done.xp).toEqual([{ amount: 20, reason: 'lesson' }]);
    expect(done.state.stats.lessonsCompleted).toBe(1);
    state = saveLessonPosition(done.state, 'loops.counter', 'story', 0, NOW);
    expect(state.lessons['loops.counter']?.completedAt).not.toBeNull();
    const again = completeLesson(state, 'loops.counter', NOW, 'Asia/Kolkata');
    expect(again.firstTime).toBe(false);
    expect(again.xp).toEqual([]);
    expect(again.state.stats.lessonsCompleted).toBe(1);
  });
});

describe('views', () => {
  it('shows every concept with its status, today and the streak', () => {
    const out = processAttempt(emptyState(), request(plain), ctx(plain));
    const map = progressMap(out.state, graph, 3, 10, NOW, 'Asia/Kolkata');
    expect(map.concepts).toHaveLength(bundle.concepts.length);
    expect(map.concepts.find((c) => c.conceptId === 'loops.counter')?.status).toBe('learning');
    expect(map.today).toMatchObject({
      localDate: '2026-10-02',
      goalMinutes: 10,
      itemsCompleted: 1,
    });
    expect(map.contentVersion).toBe(3);
  });

  it('lists due cards, most overdue first, and summarises them', () => {
    const out = processAttempt(emptyState(), request(plain), ctx(plain));
    const later = new Date(NOW.getTime() + 60 * 86_400_000);
    const queue = dueQueue(out.state, later, 20, (id) => bundle.items[id]?.concept);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({ itemId: cardKey(plain), conceptId: 'loops.counter' });
    expect(queue.dueCount).toBe(1);
    const none = dueQueue(out.state, NOW, 20, () => undefined);
    expect(none.items).toEqual([]);
    expect(none.nextDueAt).not.toBeNull();
    expect(reviewSummary(out.state, later, 'Asia/Kolkata')).toMatchObject({ dueNow: 1, total: 1 });
    expect(reviewSummary(out.state, NOW, 'Asia/Kolkata')).toMatchObject({ dueNow: 0, total: 1 });
  });

  it('exports the part of the state a new device needs', () => {
    const out = processAttempt(emptyState(), request(plain), ctx(plain));
    expect(Object.keys(engineState(out.state)).sort()).toEqual([
      'cards',
      'concepts',
      'lessons',
      'masteredAt',
      'streak',
    ]);
  });
});

describe('nextStreak', () => {
  it('continues on the next day and restarts after a gap', () => {
    const s1 = nextStreak({ current: 0, longest: 0, lastActiveOn: null }, '2026-10-01');
    const s2 = nextStreak(s1, '2026-10-02');
    expect(s2).toEqual({ current: 2, longest: 2, lastActiveOn: '2026-10-02' });
    expect(nextStreak(s2, '2026-10-02')).toBe(s2);
    expect(nextStreak(s2, '2026-10-05')).toEqual({
      current: 1,
      longest: 2,
      lastActiveOn: '2026-10-05',
    });
  });
});
