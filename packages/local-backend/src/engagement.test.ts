import bundleJson from '@logicpath/content/bundle.json';
import { createClient, memoryTokenStore, type ApiError } from '@logicpath/api-client';
import { localTransport } from '@logicpath/api-client/local';
import type { ContentBundle } from '@logicpath/content-schema';
import { correctAnswer } from '@logicpath/grader';
import { describe, expect, it } from 'vitest';
import {
  createLocalBackend,
  DEMO_ACCOUNTS,
  DEMO_CLASS_CODE,
  DEMO_PASSWORD,
  memoryStorage,
} from './index';

const seed = bundleJson as unknown as ContentBundle;
const NOW = new Date('2026-10-02T10:00:00Z');

async function setup(now = NOW) {
  const backend = createLocalBackend({ seed, storage: memoryStorage(), now: () => now });
  await backend.ready;
  const client = () => {
    const tokens = memoryTokenStore();
    return createClient(
      localTransport({ backend, tokens, validateResponses: true, now: () => now }),
    );
  };
  const as = async (role: 'student' | 'writer' | 'admin') => {
    const api = client();
    const account = DEMO_ACCOUNTS.find((a) => a.role === role)!;
    await api.call('auth.login', { body: { email: account.email, password: DEMO_PASSWORD } });
    return api;
  };
  return { backend, client, as };
}

const status = async (promise: Promise<unknown>) =>
  promise.then(
    () => 0,
    (error: ApiError) => error.status,
  );

const attemptFor = (itemId: string, patch: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  itemId,
  answer: correctAnswer(seed.items[itemId]!) as never,
  hintLevel: 0,
  durationMs: 15_000,
  source: 'lesson' as const,
  explainOption: null,
  solutionShown: false,
  attemptNo: 1,
  at: NOW.toISOString(),
  ...patch,
});

describe('learning', () => {
  it('grades an answer, tracks progress, pays XP and schedules a review', async () => {
    const { as } = await setup();
    const api = await as('student');
    const item = 'loops.counter.fill';
    const result = await api.call('practice.attempt', { body: attemptFor(item) });
    expect(result).toMatchObject({ correct: true, duplicate: false, xpAwarded: 10 });

    const progress = await api.call('progress.get');
    expect(progress.concepts.find((c) => c.conceptId === 'loops.counter')?.status).toBe('learning');
    expect(progress.today.itemsCompleted).toBe(1);
    expect(progress.streak.current).toBe(1);

    const rewards = await api.call('rewards.me');
    expect(rewards.xp).toBe(10);
    expect(rewards.badges.map((b) => b.id)).toContain('first-answer');
    expect((await api.call('reviews.summary')).total).toBe(1);
    expect(Object.keys((await api.call('progress.state')).cards)).toEqual([item]);
  });

  it('counts a resent attempt once', async () => {
    const { as } = await setup();
    const api = await as('student');
    const body = attemptFor('loops.counter.fill');
    await api.call('practice.attempt', { body });
    const again = await api.call('practice.attempt', { body });
    expect(again.duplicate).toBe(true);
    expect((await api.call('rewards.me')).xp).toBe(10);
  });

  it('syncs a batch of attempts made offline', async () => {
    const { as } = await setup();
    const api = await as('student');
    const { results } = await api.call('practice.sync', {
      body: {
        attempts: [attemptFor('loops.counter.fill'), attemptFor('loops.counter.arrange')],
      },
    });
    expect(results.map((r) => r.correct)).toEqual([true, true]);
  });

  it('rejects an answer for a different kind of question, and unknown questions', async () => {
    const { as } = await setup();
    const api = await as('student');
    const wrongKind = attemptFor('loops.counter.fill', { answer: { type: 'mcq', option: 0 } });
    expect(await status(api.call('practice.attempt', { body: wrongKind }))).toBe(400);
    expect(
      await status(
        api.call('practice.attempt', {
          body: { ...attemptFor('loops.counter.fill'), itemId: 'nope' },
        }),
      ),
    ).toBe(404);
  });

  it('saves a lesson position, completes it once and pays for it once', async () => {
    const { as } = await setup();
    const api = await as('student');
    const saved = await api.call('progress.lesson.position', {
      params: { conceptId: 'loops.counter' },
      body: { beat: 'see', practiceIndex: 0 },
    });
    expect(saved.beat).toBe('see');
    await api.call('progress.lesson.complete', { params: { conceptId: 'loops.counter' } });
    await api.call('progress.lesson.complete', { params: { conceptId: 'loops.counter' } });
    const rewards = await api.call('rewards.me');
    expect(rewards.xp).toBe(20);
    expect(rewards.badges.map((b) => b.id)).toContain('first-lesson');
    expect(
      await status(api.call('progress.lesson.complete', { params: { conceptId: 'nope' } })),
    ).toBe(404);
  });

  it('puts everything the dashboard needs in one call', async () => {
    const { as } = await setup();
    const api = await as('student');
    await api.call('practice.attempt', { body: attemptFor('loops.counter.fill') });
    const home = await api.call('home');
    expect(home.progress.today.itemsCompleted).toBe(1);
    expect(home.rewards.xp).toBe(10);
    expect(home.league?.standings.some((s) => s.isMe)).toBe(true);
    expect(home.flags.flags['map.3d']?.on).toBe(true);
    expect(home.unreadNotifications).toBeGreaterThan(0);
  });
});

describe('leaderboard', () => {
  it('shows my league with the demo learners, and where I stand', async () => {
    const { as } = await setup();
    const api = await as('student');
    await api.call('practice.attempt', { body: attemptFor('loops.counter.fill') });
    const league = await api.call('leaderboard.league');
    expect(league.tier).toBe('bronze');
    expect(league.weekStart).toBe('2026-09-28');
    expect(league.standings.length).toBeGreaterThan(8);
    expect(league.standings.filter((s) => s.isMe)).toHaveLength(1);
    expect(league.standings.map((s) => s.rank)).toEqual(league.standings.map((_, i) => i + 1));
  });

  it('moves people between leagues when a week is over', async () => {
    const { backend, client } = await setup();
    const api = client();
    const account = DEMO_ACCOUNTS[0];
    await api.call('auth.login', { body: { email: account.email, password: DEMO_PASSWORD } });
    await api.call('leaderboard.league');
    // A week later, the demo learners have studied for a week and the old week is settled.
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    const next = createClient(
      localTransport({
        backend,
        tokens: memoryTokenStore(),
        validateResponses: true,
        now: () => later,
      }),
    );
    await next.call('auth.login', { body: { email: account.email, password: DEMO_PASSWORD } });
    await next.call('leaderboard.league');
    const tiers = new Set(Object.values(backend.db.t.leagues).map((l) => l.tier));
    expect(tiers.size).toBeGreaterThan(1);
    expect(backend.db.t.settledWeeks.length).toBeGreaterThan(0);
    const history = await next.call('leaderboard.history');
    expect(Array.isArray(history.items)).toBe(true);
  });
});

describe('classes', () => {
  it('lets a student join with a code, see the class and leave', async () => {
    const { as } = await setup();
    const api = await as('student');
    const joined = await api.call('classes.join', { body: { code: DEMO_CLASS_CODE } });
    expect(joined.code).toBeNull();
    expect(joined.memberCount).toBeGreaterThan(5);
    const mine = await api.call('classes.mine');
    expect(mine.items.map((c) => c.id)).toEqual([joined.id]);
    const detail = await api.call('classes.get', { params: { id: joined.id } });
    expect(detail.members).toEqual([]); // members don't see the roster
    expect((await api.call('rewards.me')).badges.map((b) => b.id)).toContain('classmate');
    await api.call('classes.leave', { params: { id: joined.id } });
    expect((await api.call('classes.mine')).items).toEqual([]);
    expect(await status(api.call('classes.join', { body: { code: 'ZZZZZZ' } }))).toBe(404);
  });

  it('shows the roster and the code to an admin, who can make, re-code and delete classes', async () => {
    const { as } = await setup();
    const admin = await as('admin');
    const all = await admin.call('admin.classes.list', { query: {} });
    const demo = all.items[0]!;
    expect(demo.code).toBe(DEMO_CLASS_CODE);
    const roster = await admin.call('classes.get', { params: { id: demo.id } });
    expect(roster.members.length).toBe(8);
    expect(roster.members[0]).toHaveProperty('xpThisWeek');

    const made = await admin.call('admin.classes.create', { body: { name: 'Evening batch' } });
    expect(made.code).toMatch(/^[A-Z2-9]{6}$/);
    const recoded = await admin.call('admin.classes.newCode', { params: { id: made.id } });
    expect(recoded.code).not.toBe(made.code);
    await admin.call('admin.classes.delete', { params: { id: made.id } });
    expect(
      (await admin.call('admin.classes.list', { query: {} })).items.some((c) => c.id === made.id),
    ).toBe(false);
  });

  it('keeps students out of classes they are not in and out of admin screens', async () => {
    const { as } = await setup();
    const student = await as('student');
    const admin = await as('admin');
    const demo = (await admin.call('admin.classes.list', { query: {} })).items[0]!;
    expect(await status(student.call('classes.get', { params: { id: demo.id } }))).toBe(404);
    expect(await status(student.call('admin.classes.list', { query: {} }))).toBe(403);
  });
});

describe('notifications', () => {
  it('lists the inbox, marks things read and keeps email preferences', async () => {
    const { as } = await setup();
    const api = await as('student');
    await api.call('practice.attempt', { body: attemptFor('loops.counter.fill') });
    const list = await api.call('notifications.list', { query: {} });
    expect(list.unreadCount).toBe(list.items.filter((n) => !n.readAt).length);
    await api.call('notifications.read', { params: { id: list.items[0]!.id } });
    await api.call('notifications.readAll');
    expect((await api.call('notifications.list', { query: {} })).unreadCount).toBe(0);
    const prefs = await api.call('notifications.prefs');
    expect(prefs.reviewReminders).toBe(true);
    const saved = await api.call('notifications.setPrefs', {
      body: { ...prefs, productNews: true },
    });
    expect(saved.productNews).toBe(true);
  });

  it('sends a review reminder when cards are due', async () => {
    const { backend } = await setup();
    const tokens = memoryTokenStore();
    const make = (now: Date) =>
      createClient(localTransport({ backend, tokens, validateResponses: true, now: () => now }));
    const day1 = make(NOW);
    await day1.call('auth.login', {
      body: { email: DEMO_ACCOUNTS[0].email, password: DEMO_PASSWORD },
    });
    await day1.call('practice.attempt', { body: attemptFor('loops.counter.fill') });
    const later = make(new Date(NOW.getTime() + 60 * 86_400_000));
    const list = await later.call('notifications.list', { query: {} });
    expect(list.items.some((n) => n.kind === 'review_due')).toBe(true);
    const again = await later.call('notifications.list', { query: {} });
    expect(again.items.filter((n) => n.kind === 'review_due')).toHaveLength(1);
  });
});

describe('sign-up, consent and passwords', () => {
  const grownUp = {
    email: 'new@example.com',
    password: 'a-good-password',
    name: 'New Learner',
    birthYear: 1995,
  };

  it('signs an adult in straight away and sends a welcome and a verification email', async () => {
    const { backend, client } = await setup();
    const api = client();
    const result = await api.call('auth.register', { body: grownUp });
    expect(result.status).toBe('active');
    const mail = backend.db.t.mailbox.find((m) => m.to === grownUp.email)!;
    const token = new URL(mail.link!, 'http://x').searchParams.get('token')!;
    await api.call('auth.verifyEmail', { body: { token } });
    expect((await api.call('auth.me')).emailVerified).toBe(true);
    expect(await status(api.call('auth.verifyEmail', { body: { token } }))).toBe(400); // single use
    const inbox = await api.call('notifications.list', { query: {} });
    expect(inbox.items.some((n) => n.kind === 'system')).toBe(true);
  });

  it('keeps a young learner waiting until a parent approves', async () => {
    const { backend, client, as } = await setup();
    const api = client();
    const child = {
      ...grownUp,
      email: 'kid@example.com',
      birthYear: 2014,
      parentEmail: 'parent@example.com',
    };
    const result = await api.call('auth.register', { body: child });
    expect(result.status).toBe('pending_consent');
    expect(
      await status(
        api.call('auth.login', { body: { email: child.email, password: child.password } }),
      ),
    ).toBe(403);

    const mail = backend.db.t.mailbox.find((m) => m.to === 'parent@example.com')!;
    const token = mail.link!.split('/').pop()!;
    const request = await api.call('consent.request', { params: { token } });
    expect(request).toMatchObject({ childName: child.name, status: 'pending' });

    const admin = await as('admin');
    expect((await admin.call('admin.consent.list', { query: {} })).items[0]).toMatchObject({
      parentEmail: 'parent@example.com',
      status: 'pending',
    });

    expect((await api.call('consent.respond', { body: { token, decision: 'grant' } })).status).toBe(
      'granted',
    );
    expect(await status(api.call('consent.respond', { body: { token, decision: 'grant' } }))).toBe(
      409,
    );
    await api.call('auth.login', { body: { email: child.email, password: child.password } });
    expect((await api.call('auth.me')).status).toBe('active');
  });

  it('forgets a child whose parent says no', async () => {
    const { backend, client } = await setup();
    const api = client();
    const child = {
      ...grownUp,
      email: 'kid2@example.com',
      birthYear: 2015,
      parentEmail: 'p2@example.com',
    };
    await api.call('auth.register', { body: child });
    const token = backend.db.t.mailbox
      .find((m) => m.to === 'p2@example.com')!
      .link!.split('/')
      .pop()!;
    expect((await api.call('consent.respond', { body: { token, decision: 'deny' } })).status).toBe(
      'denied',
    );
    expect(Object.values(backend.db.t.users).some((u) => u.email === child.email)).toBe(false);
  });

  it('resets a password from the emailed link, once', async () => {
    const { backend, client } = await setup();
    const api = client();
    await api.call('auth.register', { body: grownUp });
    await api.call('auth.forgotPassword', { body: { email: grownUp.email } });
    await api.call('auth.forgotPassword', { body: { email: 'nobody@example.com' } }); // same answer
    const mail = backend.db.t.mailbox.find((m) => m.subject === 'Reset your password')!;
    const token = new URL(mail.link!, 'http://x').searchParams.get('token')!;
    await api.call('auth.resetPassword', { body: { token, password: 'another-password' } });
    expect(
      await status(api.call('auth.resetPassword', { body: { token, password: 'third-password' } })),
    ).toBe(400);
    expect(
      await status(
        api.call('auth.login', { body: { email: grownUp.email, password: grownUp.password } }),
      ),
    ).toBe(401);
    await api.call('auth.login', { body: { email: grownUp.email, password: 'another-password' } });
  });

  it('exports and deletes a learner’s data, but not the shared demo accounts’', async () => {
    const { backend, client, as } = await setup();
    const api = client();
    await api.call('auth.register', { body: grownUp });
    await api.call('practice.attempt', { body: attemptFor('loops.counter.fill') });
    const data = await api.call('privacy.export');
    expect(Object.keys(data.services)).toEqual(
      expect.arrayContaining(['identity', 'profile', 'progress', 'gamification']),
    );
    const deletion = await api.call('privacy.delete');
    expect(deletion.status).toBe('completed');
    expect(
      (await api.call('privacy.deletion', { params: { id: deletion.requestId } })).status,
    ).toBe('completed');
    expect(Object.values(backend.db.t.users).some((u) => u.email === grownUp.email)).toBe(false);
    expect(backend.db.t.attempts.some((a) => a.userId === deletion.requestId)).toBe(false);
    expect(await status((await as('student')).call('privacy.delete'))).toBe(403);
  });
});

describe('search', () => {
  it('finds lessons, questions and misconceptions in either language', async () => {
    const { client } = await setup();
    const api = client();
    const en = await api.call('search.query', { query: { q: 'loop' } });
    expect(en.total).toBeGreaterThan(0);
    expect(en.hits[0]!.highlights.length).toBeGreaterThan(0);
    const concepts = await api.call('search.query', { query: { q: 'counter', type: 'concept' } });
    expect(concepts.hits.every((h) => h.type === 'concept')).toBe(true);
    const hi = await api.call('search.query', { query: { q: 'dohrana', locale: 'hi-Latn' } });
    expect(hi.total).toBeGreaterThanOrEqual(0);
    const none = await api.call('search.query', { query: { q: 'zzzzqqq' } });
    expect(none).toEqual({ hits: [], total: 0 });
    expect(await status(api.call('search.query', { query: { q: '' } }))).toBe(400);
  });
});

describe('flags', () => {
  it('evaluates for the person, and admins can change them', async () => {
    const { as, client } = await setup();
    const anonymous = await client().call('flags.evaluate', { query: {} });
    expect(anonymous.flags['map.3d']?.on).toBe(true);
    expect(anonymous.flags['studio.media']?.on).toBe(false); // writers and admins only
    const writer = await as('writer');
    expect((await writer.call('flags.evaluate', { query: {} })).flags['studio.media']?.on).toBe(
      true,
    );
    expect(
      (await writer.call('flags.evaluate', { query: {} })).flags['config.daily-goal-options']
        ?.value,
    ).toEqual([5, 10, 15, 20, 30]);

    const admin = await as('admin');
    const flag = await admin.call('admin.flags.put', {
      params: { key: 'new.thing' },
      body: {
        description: 'x',
        enabled: true,
        rolloutPercent: 100,
        roles: [],
        platforms: ['android'],
        minAppVersion: null,
        value: 1,
      },
    });
    expect(flag.key).toBe('new.thing');
    expect(
      (await writer.call('flags.evaluate', { query: { platform: 'android' } })).flags['new.thing']
        ?.on,
    ).toBe(true);
    expect(
      (await writer.call('flags.evaluate', { query: { platform: 'web' } })).flags['new.thing']?.on,
    ).toBe(false);
    await admin.call('admin.flags.delete', { params: { key: 'new.thing' } });
    expect(await status(admin.call('admin.flags.delete', { params: { key: 'new.thing' } }))).toBe(
      404,
    );
    expect(await status(writer.call('admin.flags.list'))).toBe(403);
  });
});

describe('developer keys', () => {
  it('lets an adult create, see and revoke keys; the secret is shown once', async () => {
    const { as } = await setup();
    const api = await as('student');
    const created = await api.call('developer.keys.create', {
      body: { name: 'My app', scopes: ['curriculum:read'] },
    });
    expect(created.secret).toMatch(/^lp_live_/);
    expect(created.secret.startsWith(created.prefix)).toBe(true);
    const list = await api.call('developer.keys.list');
    expect(list.items).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.secret);
    expect(
      (await api.call('developer.keys.usage', { params: { id: created.id } })).days,
    ).toHaveLength(14);
    await api.call('developer.keys.revoke', { params: { id: created.id } });
    expect((await api.call('developer.keys.list')).items[0]!.revokedAt).not.toBeNull();
  });

  it('limits active keys, keeps minors out, and lets admins change plans', async () => {
    const { as, client } = await setup();
    const api = await as('student');
    for (let i = 0; i < 5; i++) {
      await api.call('developer.keys.create', {
        body: { name: `Key ${i}`, scopes: ['curriculum:read'] },
      });
    }
    expect(
      await status(
        api.call('developer.keys.create', { body: { name: 'Sixth', scopes: ['curriculum:read'] } }),
      ),
    ).toBe(409);

    const admin = await as('admin');
    const key = (await admin.call('admin.apiKeys.list', { query: {} })).items[0]!;
    const updated = await admin.call('admin.apiKeys.update', {
      params: { id: key.id },
      body: { plan: 'partner' },
    });
    expect(updated).toMatchObject({ plan: 'partner', dailyQuota: 50_000 });
    await admin.call('admin.apiKeys.revoke', { params: { id: key.id } });

    const kid = client();
    await kid.call('auth.register', {
      body: {
        email: 'teen@example.com',
        password: 'a-good-password',
        name: 'Teen',
        birthYear: 2011,
        parentEmail: 'p@example.com',
      },
    });
    expect(
      await status(api.call('developer.keys.revoke', { params: { id: crypto.randomUUID() } })),
    ).toBe(404);
  });
});

describe('admin dashboards', () => {
  it('summarises activity over the last days, and lists the audit log', async () => {
    const { as } = await setup();
    const admin = await as('admin');
    const overview = await admin.call('admin.analytics.overview', { query: { days: 14 } });
    expect(overview.attempts).toHaveLength(14);
    expect(overview.activeUsers.month).toBeGreaterThan(0);
    expect(overview.activeUsers.day).toBeLessThanOrEqual(overview.activeUsers.week);
    expect(overview.topMisconceptions.length).toBeLessThanOrEqual(5);

    await admin.call('admin.classes.create', { body: { name: 'Audit me' } });
    const audit = await admin.call('admin.audit.list', { query: { action: 'class.created' } });
    expect(audit.items[0]).toMatchObject({ action: 'class.created', actorRole: 'admin' });

    const writer = await as('writer');
    const stats = await writer.call('studio.analytics.items', { query: {} });
    expect(stats.items.length).toBeGreaterThan(0);
    expect(await status(writer.call('admin.analytics.overview', { query: {} }))).toBe(403);
  });
});

describe('media library', () => {
  it('stores a described picture, lists it, and lets only its owner or an admin delete it', async () => {
    const { as } = await setup();
    const writer = await as('writer');
    const form = new FormData();
    form.set(
      'file',
      new File([new Uint8Array([137, 80, 78, 71])], 'gate.png', { type: 'image/png' }),
    );
    form.set('alt', 'A school gate');
    const asset = await writer.call('studio.media.upload', { body: form });
    expect(asset).toMatchObject({ filename: 'gate.png', alt: 'A school gate' });
    expect(Object.keys(asset.urls)).toEqual(['w320', 'w640', 'w1280']);
    expect((await writer.call('studio.media.list', { query: {} })).items).toHaveLength(1);

    const bad = new FormData();
    bad.set('file', new File(['x'], 'notes.txt', { type: 'text/plain' }));
    bad.set('alt', 'Not a picture');
    expect(await status(writer.call('studio.media.upload', { body: bad }))).toBe(415);
    const noAlt = new FormData();
    noAlt.set('file', new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    expect(await status(writer.call('studio.media.upload', { body: noAlt }))).toBe(400);

    const admin = await as('admin');
    await admin.call('studio.media.delete', { params: { id: asset.id } });
    expect((await writer.call('studio.media.list', { query: {} })).items).toEqual([]);
  });
});
