import { makeEvent, routesOf, type EventData, type EventType } from '@logicpath/contracts';
import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import {
  baseTestEnv,
  createTestDatabase,
  documentedRoutes,
  eventually,
  outboxEvents,
  testBus,
  testKeys,
  testPrefix,
} from '@logicpath/service-kit/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env, notificationService, type NotificationConfig } from '../src/service';
import { fakeSmtp } from './smtp';

/** Mail apps undo quoted-printable (soft line breaks and =XX); so does this. */
const decoded = (data: string) =>
  data
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

let service: RunningService<NotificationConfig>;
let dbUrl: string;
let drop: () => Promise<void>;
let prefix: string;
let smtp: Awaited<ReturnType<typeof fakeSmtp>>;
let keys: Awaited<ReturnType<typeof testKeys>>;
const asha = crypto.randomUUID(); // English
const ravi = crypto.randomUUID(); // Hinglish
const kid = crypto.randomUUID(); // waits for a parent
const writer = crypto.randomUUID();
let token: Record<'asha' | 'ravi' | 'writer', string>;

async function publish<T extends EventType>(type: T, data: EventData<T>) {
  const bus = await testBus(prefix);
  await bus.publish(makeEvent(type, data, 'test'));
  await bus.close();
}

const register = (
  userId: string,
  name: string,
  locale: 'en' | 'hi-Latn',
  status: 'active' | 'pending_consent' = 'active',
) =>
  publish('identity.user.registered', {
    userId,
    email: `${name.toLowerCase()}@example.com`,
    name,
    role: 'student',
    locale,
    birthYear: 2000,
    minor: status === 'pending_consent',
    parentEmail: status === 'pending_consent' ? 'parent@example.com' : null,
    status,
  });

const call = async (method: string, url: string, tok?: string, body?: unknown) => {
  const res = await service.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: tok ? { authorization: `Bearer ${tok}` } : {},
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
};
const internal = async (method: string, url: string, body?: unknown) =>
  (
    await service.app.inject({
      method: method as 'POST',
      url,
      payload: body as object,
      headers: { 'x-internal-token': service.ctx.config.INTERNAL_TOKEN },
    })
  ).json() as Record<string, any>;
const inbox = async (who: keyof typeof token) =>
  (await call('GET', '/v1/notifications?limit=100', token[who])).body;
const titles = async (who: keyof typeof token) =>
  (await inbox(who)).items.map((n: { title: string }) => n.title) as string[];

async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await service.ctx.database.pool.query(text, params);
  return rows as T[];
}

beforeAll(async () => {
  ({ url: dbUrl, drop } = await createTestDatabase('notification'));
  prefix = testPrefix();
  keys = await testKeys();
  smtp = await fakeSmtp();
  service = await startService(
    notificationService(
      loadConfig(
        env,
        baseTestEnv('notification', dbUrl, prefix, {
          JWT_PUBLIC_JWK: keys.publicJwk,
          PUBLIC_WEB_URL: 'https://web.example.test',
          SMTP_URL: smtp.url,
          MAIL_FROM: 'LogicPath <hello@example.test>',
          MAIL_EVERY_SECONDS: '0',
          REMINDER_EVERY_SECONDS: '0',
        }),
      ),
    ),
  );
  token = {
    asha: await keys.token(asha, 'student'),
    ravi: await keys.token(ravi, 'student'),
    writer: await keys.token(writer, 'writer'),
  };
  await register(asha, 'Asha', 'en');
  await register(ravi, 'Ravi', 'hi-Latn');
  await register(kid, 'Kiran', 'en', 'pending_consent');
});

afterAll(async () => {
  await service?.stop();
  await smtp?.close();
  await drop?.();
});

describe('welcome and milestones', () => {
  it('welcomes people in their language, and makes a child wait for a parent', async () => {
    await eventually(
      async () => (await titles('asha')).length > 0 && (await titles('ravi')).length > 0,
    );
    expect(await titles('asha')).toEqual(['Welcome to LogicPath!']);
    expect(await titles('ravi')).toEqual(['LogicPath me swagat hai!']);
    expect(await sql('SELECT 1 FROM notifications WHERE user_id = $1', [kid])).toEqual([]);
    await publish('consent.granted', { requestId: crypto.randomUUID(), userId: kid });
    await eventually(
      async () => (await sql('SELECT 1 FROM notifications WHERE user_id = $1', [kid])).length > 0,
    );
    // and the child is told by email too
    await internal('POST', '/internal/mail/flush');
    expect(
      smtp.mails.some((m) => m.to.includes('kiran@example.com') && /approved/.test(m.data)),
    ).toBe(true);
  });

  it('tells a learner about a level, a badge and a class they joined', async () => {
    const at = new Date().toISOString();
    await publish('gamification.level.up', { userId: asha, level: 2, xp: 120 });
    await publish('gamification.badge.earned', { userId: asha, badgeId: 'first-answer', at });
    await publish('classroom.member.joined', {
      classId: crypto.randomUUID(),
      userId: asha,
      ownerId: writer,
      className: 'Grade 8',
    });
    await eventually(async () => (await titles('asha')).length === 4);
    const list = (await inbox('asha')).items as {
      kind: string;
      title: string;
      body: string;
      link: string;
    }[];
    expect(list.find((n) => n.kind === 'level_up')).toMatchObject({
      title: 'Level 2!',
      link: '/profile',
    });
    expect(list.find((n) => n.kind === 'badge')).toMatchObject({
      title: 'New badge: First step',
      link: '/profile',
    });
    expect(list.find((n) => n.kind === 'class')).toMatchObject({
      title: 'You joined Grade 8',
      link: '/classes',
    });
  });

  it('writes in Hinglish for people who chose it, and ignores a badge it does not know', async () => {
    await publish('gamification.level.up', { userId: ravi, level: 3, xp: 300 });
    await publish('gamification.badge.earned', {
      userId: ravi,
      badgeId: 'no-such-badge',
      at: new Date().toISOString(),
    });
    await publish('gamification.badge.earned', {
      userId: ravi,
      badgeId: 'first-answer',
      at: new Date().toISOString(),
    });
    await eventually(async () => (await titles('ravi')).length === 3);
    expect(await titles('ravi')).toEqual(
      expect.arrayContaining(['Level 3!', 'Naya badge: Pehla kadam']),
    );
  });

  it('announces a promotion or a demotion in the weekly league, but not staying put', async () => {
    const week = (result: 'promoted' | 'stayed' | 'demoted', tier: string, rank: number) =>
      publish('leaderboard.week.closed', {
        userId: asha,
        weekStart: '2026-09-28',
        tier,
        rank,
        result,
      });
    await week('promoted', 'bronze', 2);
    await week('stayed', 'silver', 12);
    await week('demoted', 'gold', 28);
    await eventually(async () => (await titles('asha')).includes('Moved down to Silver'));
    const all = await titles('asha');
    expect(all).toEqual(expect.arrayContaining(['Promoted to Silver!', 'Moved down to Silver']));
    expect(all.filter((t) => /league|Promoted|Moved/.test(t))).toHaveLength(2);
  });
});

describe('the inbox', () => {
  it('lists newest first with the number unread, a page at a time', async () => {
    const all = await inbox('asha');
    expect(all.unreadCount).toBe(all.items.length);
    const created = all.items.map((n: { createdAt: string }) => n.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
    const first = await call('GET', '/v1/notifications?limit=3', token.asha);
    expect(first.body.items).toHaveLength(3);
    expect(first.body.nextCursor).toBeTruthy();
    const rest = await call(
      'GET',
      `/v1/notifications?limit=3&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      token.asha,
    );
    const ids = [...first.body.items, ...rest.body.items].map((n: { id: string }) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(all.items.length);
    expect((await call('GET', '/v1/notifications')).status).toBe(401);
  });

  it('marks one read, then all, and keeps people out of each other’s inbox', async () => {
    const mine = (await inbox('asha')).items[0];
    expect((await call('POST', `/v1/notifications/${mine.id}/read`, token.asha)).status).toBe(200);
    expect((await inbox('asha')).unreadCount).toBe((await inbox('asha')).items.length - 1);
    expect((await call('POST', `/v1/notifications/${mine.id}/read`, token.ravi)).status).toBe(404);
    expect(
      (await call('POST', `/v1/notifications/${crypto.randomUUID()}/read`, token.asha)).status,
    ).toBe(404);
    expect((await call('POST', '/v1/notifications/read-all', token.asha)).status).toBe(200);
    expect((await inbox('asha')).unreadCount).toBe(0);
    expect((await inbox('ravi')).unreadCount).toBeGreaterThan(0);
  });

  it('keeps preferences, with sensible defaults', async () => {
    expect((await call('GET', '/v1/notifications/preferences', token.asha)).body).toEqual({
      reviewReminders: true,
      weeklySummary: true,
      productNews: false,
    });
    const put = await call('PUT', '/v1/notifications/preferences', token.asha, {
      reviewReminders: false,
      weeklySummary: true,
      productNews: true,
    });
    expect(put.body).toEqual({ reviewReminders: false, weeklySummary: true, productNews: true });
    expect((await call('GET', '/v1/notifications/preferences', token.asha)).body.productNews).toBe(
      true,
    );
    expect(
      (await call('PUT', '/v1/notifications/preferences', token.asha, { reviewReminders: 'yes' }))
        .status,
    ).toBe(400);
  });
});

describe('writers and their submissions', () => {
  it('tells the writer when a submission is live, whichever message arrives first', async () => {
    const submissionId = crypto.randomUUID();
    const published = {
      versionId: crypto.randomUUID(),
      number: 2,
      checksum: 'abc',
      submissionId,
      publishedBy: writer,
    };
    // published first: it is retried until the approval has been seen
    await publish('content.version.published', published);
    await publish('authoring.submission.approved', {
      submissionId,
      authorId: writer,
      reviewerId: crypto.randomUUID(),
      title: 'Zebra crossing question',
    });
    await eventually(
      async () => (await titles('writer')).includes('Published: Zebra crossing question'),
      20_000,
    );
    const note = (await inbox('writer')).items.find(
      (n: { kind: string }) => n.kind === 'submission',
    );
    expect(note.link).toBe(`/studio/drafts/${submissionId}`);
  }, 30_000);

  it('passes on a reviewer’s comment, and a publish that failed', async () => {
    const submissionId = crypto.randomUUID();
    await publish('authoring.submission.rejected', {
      submissionId,
      authorId: writer,
      reviewerId: crypto.randomUUID(),
      title: 'Second try',
      comment: 'Please add a second hint.',
    });
    await eventually(async () =>
      (await titles('writer')).includes('Changes requested: Second try'),
    );
    expect(
      (await inbox('writer')).items.find((n: { title: string }) => n.title.startsWith('Changes'))!
        .body,
    ).toBe('Please add a second hint.');

    const failing = crypto.randomUUID();
    await publish('authoring.submission.approved', {
      submissionId: failing,
      authorId: writer,
      reviewerId: crypto.randomUUID(),
      title: 'Broken one',
    });
    await publish('content.publish.failed', {
      submissionId: failing,
      issues: [{ file: 'items/x.yaml', message: 'The answer is not one of the options' }],
    });
    await eventually(
      async () => (await titles('writer')).includes('Could not publish: Broken one'),
      20_000,
    );
    expect(
      (await inbox('writer')).items.find((n: { title: string }) => n.title.startsWith('Could not'))!
        .body,
    ).toBe('The answer is not one of the options');
  }, 40_000);

  it('does not announce a rollback to anyone', async () => {
    const before = (await titles('writer')).length;
    await publish('content.version.published', {
      versionId: crypto.randomUUID(),
      number: 3,
      checksum: 'def',
      submissionId: null,
      publishedBy: null,
    });
    await new Promise((r) => setTimeout(r, 600));
    expect((await titles('writer')).length).toBe(before);
  });
});

describe('email', () => {
  it('sends the verification, reset and parent emails with links to the website', async () => {
    const before = smtp.mails.length;
    await publish('identity.user.email_verification_requested', {
      userId: asha,
      email: 'asha@example.com',
      name: 'Asha',
      locale: 'en',
      token: 'verify-token-1',
    });
    await publish('identity.user.password_reset_requested', {
      userId: ravi,
      email: 'ravi@example.com',
      name: 'Ravi',
      locale: 'hi-Latn',
      token: 'reset-token-1',
    });
    await publish('consent.requested', {
      requestId: crypto.randomUUID(),
      userId: kid,
      parentEmail: 'parent@example.com',
      childName: 'Kiran',
      locale: 'en',
      token: 'consent-token-1',
    });
    await eventually(
      async () => (await sql("SELECT 1 FROM mails WHERE status = 'queued'")).length >= 3,
    );
    expect((await internal('POST', '/internal/mail/flush')).sent).toBeGreaterThanOrEqual(3);
    const sent = smtp.mails.slice(before);
    const to = (address: string) => {
      const mail = sent.find((m) => m.to.includes(address))!;
      return { ...mail, data: decoded(mail.data) };
    };
    expect(to('asha@example.com').data).toContain(
      'https://web.example.test/verify-email?token=verify-token-1',
    );
    expect(to('asha@example.com').data).toContain('Subject: Confirm your email');
    expect(to('ravi@example.com').data).toContain(
      'https://web.example.test/reset-password?token=reset-token-1',
    );
    expect(to('ravi@example.com').data).toContain('Subject: Password reset karo');
    expect(to('parent@example.com').data).toContain(
      'https://web.example.test/consent/consent-token-1',
    );
    expect(to('parent@example.com').data).toContain("approve Kiran's LogicPath account");
    expect(to('parent@example.com').from).toBe('hello@example.test');
    expect(await sql("SELECT status FROM mails WHERE status = 'queued'")).toEqual([]);
    // flushing again sends nothing twice
    expect((await internal('POST', '/internal/mail/flush')).sent).toBe(0);
  });

  it('keeps trying a few times when the mail server is down, then gives up', async () => {
    await smtp.close();
    await publish('identity.user.password_reset_requested', {
      userId: asha,
      email: 'asha@example.com',
      name: 'Asha',
      locale: 'en',
      token: 'reset-token-2',
    });
    await eventually(
      async () => (await sql("SELECT 1 FROM mails WHERE status = 'queued'")).length === 1,
    );
    for (let attempt = 1; attempt <= 5; attempt++) {
      await sql("UPDATE mails SET next_attempt_at = now() WHERE status = 'queued'");
      await internal('POST', '/internal/mail/flush');
      const [row] = await sql<{ attempts: number; status: string; last_error: string | null }>(
        'SELECT attempts, status, last_error FROM mails ORDER BY created_at DESC LIMIT 1',
      );
      expect(row!.attempts).toBe(attempt);
      expect(row!.status).toBe(attempt < 5 ? 'queued' : 'failed');
      expect(row!.last_error).toBeTruthy();
    }
  }, 60_000);
});

describe('review reminders', () => {
  it('remind once a day, when cards are due, unless switched off', async () => {
    const due = new Date(Date.now() - 3600_000).toISOString();
    for (const cardId of ['loops.counter.a', 'loops.counter.b']) {
      await publish('review.card.scheduled', { userId: ravi, cardId, due });
    }
    await publish('review.card.scheduled', { userId: asha, cardId: 'loops.counter.a', due });
    await eventually(async () => (await sql('SELECT 1 FROM card_due')).length === 3);

    // asha switched reminders off earlier; ravi gets one
    expect((await internal('POST', '/internal/reminders/run')).reminded).toBe(1);
    expect(await titles('ravi')).toContain('2 review baaki');
    expect((await titles('asha')).some((t) => /to review/.test(t))).toBe(false);
    // the same day: no second reminder
    expect((await internal('POST', '/internal/reminders/run')).reminded).toBe(0);
    // the next day, if the cards are still waiting
    const tomorrow = new Date(Date.now() + 26 * 3600_000).toISOString();
    expect((await internal('POST', '/internal/reminders/run', { now: tomorrow })).reminded).toBe(1);
    expect((await titles('ravi')).filter((t) => t === '2 review baaki')).toHaveLength(2);
    // cards pushed into the future stop the reminders
    for (const cardId of ['loops.counter.a', 'loops.counter.b']) {
      await publish('review.card.scheduled', {
        userId: ravi,
        cardId,
        due: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      });
    }
    await eventually(
      async () => (await sql('SELECT 1 FROM card_due WHERE due > now()')).length === 2,
    );
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect((await internal('POST', '/internal/reminders/run', { now: later })).reminded).toBe(0);
  });
});

describe('privacy', () => {
  it('exports and then erases everything about a person', async () => {
    const exported = await internal('GET', `/internal/users/${ravi}/export`);
    expect(exported.service).toBe('notification');
    expect(exported.data.inbox.length).toBeGreaterThan(2);
    await publish('privacy.deletion.requested', { requestId: crypto.randomUUID(), userId: ravi });
    await eventually(
      async () => (await outboxEvents(dbUrl, 'privacy.deletion.completed')).length > 0,
    );
    expect((await inbox('ravi')).items).toEqual([]);
    for (const table of ['people', 'prefs', 'card_due', 'reminders', 'mails']) {
      expect(await sql(`SELECT 1 FROM ${table} WHERE user_id = $1`, [ravi])).toEqual([]);
    }
  });
});

describe('without a mail server configured', () => {
  it('writes the email to the log and marks it skipped, instead of failing', async () => {
    const other = await createTestDatabase('notification_nosmtp');
    const bare = await startService(
      notificationService(
        loadConfig(
          env,
          baseTestEnv('notification', other.url, testPrefix(), {
            JWT_PUBLIC_JWK: keys.publicJwk,
            MAIL_EVERY_SECONDS: '0',
            REMINDER_EVERY_SECONDS: '0',
          }),
        ),
      ),
    );
    try {
      await bare.ctx.db.execute(
        (await import('drizzle-orm'))
          .sql`INSERT INTO mails (to_email, subject, text, dedupe_key) VALUES ('x@example.com', 'Hello', 'Body', 'k1')`,
      );
      const res = await bare.app.inject({
        method: 'POST',
        url: '/internal/mail/flush',
        headers: { 'x-internal-token': bare.ctx.config.INTERNAL_TOKEN },
      });
      expect(res.json()).toEqual({ sent: 1 });
      const { rows } = await bare.ctx.database.pool.query('SELECT status FROM mails');
      expect(rows).toEqual([{ status: 'skipped' }]);
    } finally {
      await bare.stop();
      await other.drop();
    }
  });
});

describe('notification contract', () => {
  it('documents exactly its rows of the shared endpoint table', async () => {
    expect(await documentedRoutes(service.app)).toEqual(routesOf('notification'));
  });
});
