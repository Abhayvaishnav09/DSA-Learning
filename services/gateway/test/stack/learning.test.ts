import { describe, expect, it } from 'vitest';
import { admin, attemptId, eventually, liveBundle, newLearner, rightAnswer, BASE } from './kit';

/**
 * A learner's day on the whole platform, through the gateway: sign up, learn a lesson, and watch
 * every service (practice, progress, review, gamification, leagues, inbox, dashboards) catch up.
 */

describe('learning end to end', async () => {
  const bundle = await liveBundle();
  const concept = 'loops.counter';
  const lesson = bundle.lessons[concept]!;
  const items = [lesson.predict.item, ...lesson.practice].map((id) => bundle.items[id]!);

  const asha = await newLearner('asha', 'Asha Stack');
  let firstAttempt: string;

  it('starts with a profile, a welcome, and a dashboard that is complete from the start', async () => {
    const profile = await eventually(async () => asha.call('profile.get').catch(() => null), {
      what: 'the profile',
    });
    expect(profile.displayName).toBe('Asha Stack');
    await asha.call('profile.update', { body: { dailyGoalMinutes: 5, locale: 'en' } });

    await eventually(
      async () => (await asha.call('notifications.list', { query: {} })).items.length > 0,
      { what: 'the welcome message' },
    );
    const inbox = await asha.call('notifications.list', { query: {} });
    expect(inbox.items.map((n) => n.title)).toContain('Welcome to LogicPath!');

    const home = await eventually(
      async () => {
        const result = await asha.call('home');
        return result.partial.length === 0 ? result : null;
      },
      { what: 'every part of the dashboard' },
    );
    expect(home.profile.dailyGoalMinutes).toBe(5);
    expect(home.progress.contentVersion).toBeGreaterThan(0);
    expect(home.rewards).toMatchObject({ xp: 0, level: 1 });
    expect(home.league?.standings.some((s) => s.isMe)).toBe(true);
    expect(home.unreadNotifications).toBeGreaterThan(0);
  });

  it('saves where the learner is in a lesson', async () => {
    const saved = await asha.call('progress.lesson.position', {
      params: { conceptId: concept },
      body: { beat: 'predict', practiceIndex: 0 },
    });
    expect(saved).toMatchObject({ conceptId: concept, beat: 'predict', completedAt: null });
  });

  it('grades answers on the server and pays XP', async () => {
    let total = 0;
    for (const [index, item] of items.entries()) {
      const { answer, explainOption } = rightAnswer(item);
      const id = attemptId();
      if (index === 0) firstAttempt = id;
      const result = await asha.call('practice.attempt', {
        body: {
          id,
          itemId: item.id,
          answer,
          hintLevel: 0,
          durationMs: 12_000,
          source: index === 0 ? 'predict' : 'lesson',
          explainOption,
          solutionShown: false,
          attemptNo: 1,
          at: new Date().toISOString(),
        },
      });
      expect(result.correct).toBe(true);
      expect(result.duplicate).toBe(false);
      total += result.xpAwarded;
    }
    expect(total).toBeGreaterThan(20);
  });

  it('counts a retried answer once', async () => {
    const item = items[0]!;
    const { answer } = rightAnswer(item);
    const again = await asha.call('practice.attempt', {
      body: {
        id: firstAttempt,
        itemId: item.id,
        answer,
        hintLevel: 0,
        durationMs: 12_000,
        source: 'predict',
        explainOption: null,
        solutionShown: false,
        attemptNo: 1,
        at: new Date().toISOString(),
      },
    });
    expect(again).toMatchObject({ duplicate: true, xpAwarded: 0 });
  });

  it('finishes the lesson, and every service catches up', async () => {
    const done = await asha.call('progress.lesson.complete', { params: { conceptId: concept } });
    expect(done.completedAt).not.toBeNull();

    // progress: the map shows the work
    const map = await eventually(
      async () => {
        const m = await asha.call('progress.get');
        return m.concepts.find((c) => c.conceptId === concept)?.attempts ? m : null;
      },
      { what: 'the progress map' },
    );
    expect(map.concepts.find((c) => c.conceptId === concept)).toMatchObject({ status: 'learning' });
    expect(map.lessons.find((l) => l.conceptId === concept)?.completedAt).not.toBeNull();
    expect(map.streak.current).toBe(1);
    expect(map.today.itemsCompleted).toBeGreaterThan(0);

    // gamification: XP, a level maybe, badges for the first answer and the first lesson
    const rewards = await eventually(
      async () => {
        const r = await asha.call('rewards.me');
        const ids = r.badges.map((b) => b.id);
        return r.xp > 40 && ids.includes('first-answer') && ids.includes('first-lesson') ? r : null;
      },
      { what: 'XP and badges' },
    );
    expect(rewards.xpThisWeek).toBe(rewards.xp);
    expect(rewards.recent.length).toBeGreaterThan(0);

    // review: the finished questions became cards, due a day or more from now
    const reviews = await eventually(
      async () => {
        const r = await asha.call('reviews.summary');
        return r.total > 0 ? r : null;
      },
      { what: 'review cards' },
    );
    expect(reviews.dueNow).toBe(0);
    expect(reviews.nextDueAt).not.toBeNull();

    // the weekly league shows this learner's XP: the same number as the rewards, once both have caught up
    const league = await eventually(
      async () => {
        const [l, r] = await Promise.all([
          asha.call('leaderboard.league'),
          asha.call('rewards.me'),
        ]);
        const me = l.standings.find((s) => s.isMe);
        return me && me.xp > 0 && me.xp === r.xp ? l : null;
      },
      { what: 'the league to show the same XP as the rewards' },
    );
    expect(league.standings.find((s) => s.isMe)!.xp).toBeGreaterThanOrEqual(rewards.xp);

    // the inbox: a badge, and level-ups when XP crossed a level
    const inbox = await eventually(
      async () => {
        const list = await asha.call('notifications.list', { query: {} });
        return list.items.some((n) => n.kind === 'badge') ? list : null;
      },
      { what: 'the badge notification' },
    );
    expect(inbox.items.map((n) => n.title)).toContain('New badge: First step');
    expect(inbox.unreadCount).toBeGreaterThan(1);
  });

  it('shows the same numbers on the dashboard, and gives a new device the whole state', async () => {
    const home = await eventually(
      async () => {
        const h = await asha.call('home');
        return h.partial.length === 0 && h.rewards.xp > 40 && h.reviews.total > 0 ? h : null;
      },
      { what: 'the finished dashboard' },
    );
    expect(home.progress.streak.current).toBe(1);
    expect(home.rewards.badges.length).toBeGreaterThanOrEqual(2);

    const state = await asha.call('progress.state');
    expect(Object.keys(state.cards).length).toBeGreaterThan(0);
    expect(state.concepts[concept]!.attempts).toBeGreaterThan(0);
    expect(state.lessons[concept]!.completedAt).not.toBeNull();
    expect(state.streak.current).toBe(1);
  });

  it('takes answers given offline, in order', async () => {
    const item = items[1]!;
    const { answer, explainOption } = rightAnswer(item);
    const attempts = Array.from({ length: 3 }, () => ({
      id: attemptId(),
      itemId: item.id,
      answer,
      hintLevel: 1,
      durationMs: 9_000,
      source: 'review' as const,
      explainOption,
      solutionShown: false,
      attemptNo: 1,
      at: new Date().toISOString(),
    }));
    const before = (await asha.call('rewards.me')).xp;
    const synced = await asha.call('practice.sync', { body: { attempts } });
    expect(synced.results.map((r) => r.attemptId)).toEqual(attempts.map((a) => a.id));
    expect(synced.results.every((r) => r.correct && !r.duplicate)).toBe(true);
    await eventually(async () => (await asha.call('rewards.me')).xp > before, {
      what: 'XP from the synced answers',
    });
    // and the reviewer badge: a finished review question
    await eventually(
      async () => (await asha.call('rewards.me')).badges.some((b) => b.id === 'reviewer'),
      { what: 'the reviewer badge' },
    );
  });

  it('shows the admin what is happening, and writers how questions perform', async () => {
    const boss = await admin();
    const overview = await eventually(
      async () => {
        const o = await boss.call('admin.analytics.overview', { query: { days: 7 } });
        return o.attempts.at(-1)!.value >= items.length ? o : null;
      },
      { what: 'the admin overview' },
    );
    expect(overview.activeUsers.day).toBeGreaterThanOrEqual(1);
    expect(overview.signups.at(-1)!.value).toBeGreaterThanOrEqual(1);
    expect(overview.lessonsCompleted.at(-1)!.value).toBeGreaterThanOrEqual(1);
    const stats = await boss.call('studio.analytics.items', { query: { conceptId: concept } });
    expect(stats.items.length).toBeGreaterThan(0);
    expect(stats.items.every((i) => i.conceptId === concept)).toBe(true);
  });

  it('finds the lesson by search, signed in or not', async () => {
    const res = await fetch(`${BASE}/v1/search?q=counter`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hits: { conceptId: string }[] };
    expect(body.hits.some((h) => h.conceptId === concept)).toBe(true);
  });
});
