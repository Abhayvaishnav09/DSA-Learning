import { hash32 } from '@logicpath/flags-rules';
import { addDays, weekStart } from '@logicpath/gamification-rules';
import { emptyState } from '@logicpath/progress-rules';
import type { LocalDb } from './db';
import { createUser } from './domains/identity';
import { DEMO_CLASS_CODE } from './accounts';
import { liveVersion } from './domains/content';
import { iso, uuid } from './util';

/**
 * Demo learners. A shared demo needs company: a league with one person in it is not a league,
 * and an empty dashboard shows nothing. These accounts only exist in the browser demo; they
 * "study" a little every day, so the leaderboard, classes and charts stay alive however long
 * ago the demo was first opened. Real deployments (the services) never create them.
 */
const LEARNERS: readonly { name: string; activity: number; skill: number; daysOld: number }[] = [
  { name: 'Aarav Mehta', activity: 0.95, skill: 0.88, daysOld: 27 },
  { name: 'Diya Nair', activity: 0.9, skill: 0.82, daysOld: 25 },
  { name: 'Vihaan Gupta', activity: 0.8, skill: 0.75, daysOld: 24 },
  { name: 'Ananya Iyer', activity: 0.85, skill: 0.9, daysOld: 22 },
  { name: 'Kabir Singh', activity: 0.6, skill: 0.7, daysOld: 21 },
  { name: 'Isha Reddy', activity: 0.7, skill: 0.78, daysOld: 19 },
  { name: 'Rohan Das', activity: 0.5, skill: 0.65, daysOld: 18 },
  { name: 'Meera Pillai', activity: 0.75, skill: 0.85, daysOld: 16 },
  { name: 'Arjun Kapoor', activity: 0.4, skill: 0.6, daysOld: 14 },
  { name: 'Saanvi Joshi', activity: 0.65, skill: 0.8, daysOld: 12 },
  { name: 'Kavya Menon', activity: 0.55, skill: 0.72, daysOld: 9 },
  { name: 'Dev Malhotra', activity: 0.35, skill: 0.55, daysOld: 7 },
  { name: 'Tara Bose', activity: 0.7, skill: 0.83, daysOld: 5 },
  { name: 'Yash Patil', activity: 0.45, skill: 0.68, daysOld: 3 },
];

/** Leagues and classes count days in India, where the app is first aimed. */
const IST_OFFSET_MS = 5.5 * 3_600_000;

export const istDate = (at: Date): string =>
  new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** The moment a local (IST) day starts. */
export const startOfIstDay = (date: string): Date =>
  new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS);

function random(seed: string): () => number {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export const isDemoLearner = (email: string) => /^learner\d+@demo\.logicpath\.dev$/.test(email);

export async function ensureDemoLearners(
  db: LocalDb,
  now: Date,
  makeClass: (name: string, code: string) => void,
) {
  if (db.t.meta['demoLearners']) return;
  for (const [index, learner] of LEARNERS.entries()) {
    const row = await createUser(
      db,
      {
        email: `learner${index + 1}@demo.logicpath.dev`,
        password: uuid(),
        name: learner.name,
        role: 'student',
        birthYear: now.getUTCFullYear() - 22,
      },
      new Date(now.getTime() - learner.daysOld * 86_400_000),
    );
    db.t.learners[row.id] = emptyState();
  }
  makeClass('Class 9-B (demo)', DEMO_CLASS_CODE);
  // The made-up history is for the charts only: leagues start fresh this week, so a new learner
  // meets everyone in the same league instead of a ladder that was already sorted.
  const thisWeek = weekStart(istDate(now));
  for (
    let monday = weekStart(addDays(thisWeek, -35));
    monday < thisWeek;
    monday = addDays(monday, 7)
  ) {
    db.t.settledWeeks.push(monday);
  }
  db.t.meta['demoLearners'] = '1';
  db.touch();
}

/** Lets every demo learner "study" on each day since the last visit (once per day, all deterministic). */
export function simulateDemo(db: LocalDb, now: Date) {
  const today = istDate(now);
  if (db.t.meta['simulatedThrough'] === today) return;
  const items = Object.values(liveVersion(db).bundle.items);
  const published = new Set(
    liveVersion(db)
      .bundle.concepts.filter((c) => c.published)
      .map((c) => c.id),
  );
  const pool = items.filter((i) => published.has(i.concept));
  if (pool.length === 0) return;
  const mistakes = Object.keys(liveVersion(db).bundle.misconceptions);

  const learners = Object.values(db.t.users).filter((u) => isDemoLearner(u.email));
  for (const user of learners) {
    const config = LEARNERS[Number(/\d+/.exec(user.email)![0]) - 1]!;
    const state = (db.t.learners[user.id] ??= emptyState());
    const from = db.t.meta[`sim:${user.id}`]
      ? addDays(db.t.meta[`sim:${user.id}`]!, 1)
      : istDate(new Date(user.createdAt));
    for (
      let day = from < addDays(today, -28) ? addDays(today, -28) : from;
      day <= today;
      day = addDays(day, 1)
    ) {
      const rng = random(`${user.id}:${day}`);
      const active = rng() < config.activity && !(day === today && rng() < 0.3);
      if (!active) continue;
      const dayStart = startOfIstDay(day).getTime();
      let xp = 0;
      const count = 4 + Math.floor(rng() * 12);
      for (let i = 0; i < count; i++) {
        const item = pool[Math.floor(rng() * pool.length)]!;
        const correct = rng() < config.skill;
        const at = new Date(dayStart + (8 + rng() * 13) * 3_600_000);
        if (at > now) continue;
        db.t.attempts.push({
          id: uuid(),
          userId: user.id,
          itemId: item.id,
          conceptId: item.concept,
          correct,
          misconception:
            correct || mistakes.length === 0
              ? null
              : mistakes[Math.floor(rng() * mistakes.length)]!,
          hintLevel: correct ? Math.floor(rng() * 2) : 0,
          durationMs: 8_000 + Math.floor(rng() * 50_000),
          source: rng() < 0.2 ? 'review' : 'lesson',
          at: iso(at),
        });
        if (correct) xp += rng() < 0.7 ? 10 : 7;
      }
      if (rng() < 0.15) xp += 20;
      // Some of them finish the lesson that exists, once, on a day they were active.
      if (!state.lessons['loops.counter'] && rng() < 0.3) {
        const at = iso(new Date(Math.min(now.getTime(), dayStart + 15 * 3_600_000)));
        state.lessons['loops.counter'] = {
          conceptId: 'loops.counter',
          beat: 'recap',
          practiceIndex: 0,
          startedAt: at,
          completedAt: at,
        };
        state.stats.lessonsCompleted += 1;
      }
      if (xp > 0) {
        db.t.xp.push({
          userId: user.id,
          amount: xp,
          reason: 'attempt',
          at: iso(new Date(Math.min(now.getTime(), dayStart + 19 * 3_600_000))),
        });
        state.streak = {
          current: state.streak.lastActiveOn === addDays(day, -1) ? state.streak.current + 1 : 1,
          longest: 0,
          lastActiveOn: day,
        };
        state.streak.longest = Math.max(state.streak.longest, state.streak.current);
        state.stats.longestStreak = Math.max(state.stats.longestStreak, state.streak.longest);
        state.stats.correctTotal += count;
        state.days[day] = { minutes: count * 0.7, items: count, lessons: 0, goalPaid: true };
      }
    }
    db.t.meta[`sim:${user.id}`] = today;
    // They also master concepts as the weeks go by (shown on class rosters).
    const mastered = Math.min(published.size, Math.floor(state.stats.correctTotal / 90));
    state.stats.conceptsMastered = mastered;
  }
  db.t.meta['simulatedThrough'] = today;
  db.touch();
}
