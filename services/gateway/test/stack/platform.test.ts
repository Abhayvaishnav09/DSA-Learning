import { ApiError } from '@logicpath/api-client';
import type { content } from '@logicpath/contracts';
import { PRIVACY_SERVICES } from '@logicpath/contracts';
import { describe, expect, it } from 'vitest';
import {
  Actor,
  admin,
  attemptId,
  eventually,
  liveBundle,
  mailAvailable,
  mailTo,
  newLearner,
  newStaff,
  png,
  raw,
  rightAnswer,
  uniqueEmail,
} from './kit';

/**
 * Everything around learning, through the gateway: teachers and classes, a writer's question
 * reaching every learner, a child's account and a parent's consent, pictures, feature flags,
 * the public API, the audit trail and the right to be forgotten.
 */

const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** The failure a call ends with, so a test can say what it expects to be refused. */
async function refusal(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('the call was expected to be refused');
}

describe('a class and its teacher', async () => {
  const boss = await admin();
  const teacher = await newStaff(boss, 'writer', 'teacher', 'Tara Teacher');
  const pupil = await newLearner('pupil', 'Pia Pupil');
  const name = `Class 9B ${stamp()}`;
  let classId = '';
  let code = '';

  it('is created by an admin for a teacher, with a code to share', async () => {
    const made = await boss.call('admin.classes.create', {
      body: { name, ownerId: teacher.user!.id },
    });
    classId = made.id;
    code = made.code!;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(made).toMatchObject({ name, ownerName: 'Tara Teacher', memberCount: 0 });

    const mine = await teacher.call('classes.mine');
    expect(mine.items.map((c) => c.id)).toContain(classId);
    const all = await boss.call('admin.classes.list', { query: {} });
    expect(all.items.map((c) => c.id)).toContain(classId);
  });

  it('is joined with the code, and a wrong code is refused', async () => {
    expect((await refusal(pupil.call('classes.join', { body: { code: 'ZZZZZZ' } }))).status).toBe(
      404,
    );
    const joined = await pupil.call('classes.join', { body: { code } });
    expect(joined).toMatchObject({ id: classId, memberCount: 1, code: null });
    // a second time changes nothing
    expect((await pupil.call('classes.join', { body: { code } })).memberCount).toBe(1);

    const inbox = await eventually(
      async () => {
        const list = await pupil.call('notifications.list', { query: {} });
        return list.items.some((n) => n.kind === 'class') ? list : null;
      },
      { what: 'the "you joined" message' },
    );
    expect(inbox.items.map((n) => n.title)).toContain(`You joined ${name}`);
  });

  it('shows the teacher how the pupil is doing, and shows the pupil only the class', async () => {
    const bundle = await liveBundle();
    const item = bundle.items[bundle.lessons['loops.counter']!.practice[0]!]!;
    const { answer, explainOption } = rightAnswer(item);
    await pupil.call('practice.attempt', {
      body: {
        id: attemptId(),
        itemId: item.id,
        answer,
        hintLevel: 0,
        durationMs: 8_000,
        source: 'lesson',
        explainOption,
        solutionShown: false,
        attemptNo: 1,
        at: new Date().toISOString(),
      },
    });

    const detail = await eventually(
      async () => {
        const d = await teacher.call('classes.get', { params: { id: classId } });
        const row = d.members.find((m) => m.userId === pupil.user!.id);
        return row && row.xpThisWeek > 0 && row.lastActiveOn ? d : null;
      },
      { what: "the pupil's XP on the roster" },
    );
    expect(detail.code).toBe(code);
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0]).toMatchObject({ name: 'Pia Pupil' });

    const seenByPupil = await pupil.call('classes.get', { params: { id: classId } });
    expect(seenByPupil.members).toEqual([]);
    expect(seenByPupil.code).toBeNull();
    // someone outside the class sees nothing
    const stranger = await newLearner('stranger');
    expect((await refusal(stranger.call('classes.get', { params: { id: classId } }))).status).toBe(
      404,
    );
  });

  it('can be left, and removed by an admin', async () => {
    await pupil.call('classes.leave', { params: { id: classId } });
    expect((await pupil.call('classes.mine')).items).toEqual([]);
    expect((await teacher.call('classes.get', { params: { id: classId } })).members).toEqual([]);

    await boss.call('admin.classes.delete', { params: { id: classId } });
    expect((await teacher.call('classes.mine')).items.map((c) => c.id)).not.toContain(classId);
  });
});

describe('a new question, from a writer to every learner', async () => {
  const boss = await admin();
  const writer = await newStaff(boss, 'writer', 'writer', 'Wendy Writer');
  const learner = await newLearner('reader', 'Rhea Reader');
  const bundle = await liveBundle();
  const label = stamp();
  const word = `zebra${label}`;
  const original = bundle.items['loops.counter.how-many']!;
  if (original.type !== 'mcq') throw new Error('the sample question should be multiple choice');
  const itemId = `loops.counter.how-many.${label}`;
  const title = `Zebra question ${label}`;
  const change: content.ContentChange = {
    kind: 'item',
    op: 'upsert',
    id: itemId,
    data: {
      ...original,
      id: itemId,
      variationOf: original.id,
      prompt: {
        en: `${word}: how many times is "hi" shown on the screen?`,
        'hi-Latn': `${word}: "hi" screen par kitni baar dikhega?`,
      },
    },
  };
  let draftId = '';
  let before = 0;

  it('is drafted, checked, and sent for review', async () => {
    before = (await writer.call('content.manifest')).number;
    const draft = await writer.call('studio.drafts.create', {
      body: { title, changes: [change] },
    });
    draftId = draft.id;
    expect(draft).toMatchObject({ status: 'draft', authorName: 'Wendy Writer', changeCount: 1 });

    const checked = await writer.call('studio.drafts.validate', { params: { id: draftId } });
    expect(checked.ok).toBe(true);
    const sent = await writer.call('studio.drafts.submit', { params: { id: draftId } });
    expect(sent.status).toBe('in_review');
  });

  it('is reviewed by an admin, never by its writer', async () => {
    const queue = await boss.call('admin.review.list', { query: {} });
    expect(queue.items.map((d) => d.id)).toContain(draftId);
    expect(
      (await refusal(writer.call('admin.review.approve', { params: { id: draftId }, body: {} })))
        .status,
    ).toBe(403);
    const approved = await boss.call('admin.review.approve', {
      params: { id: draftId },
      body: { comment: 'Clear and correct' },
    });
    expect(approved.status).toBe('approved');
  });

  it('goes live for everyone', async () => {
    const published = await eventually(
      async () => {
        const d = await writer.call('studio.drafts.get', { params: { id: draftId } });
        return d.status === 'published' ? d : null;
      },
      { what: 'the draft to be published' },
    );
    expect(published.publishedVersion).toBeGreaterThan(before);
    expect(published.activity.map((a) => a.action)).toEqual([
      'created',
      'submitted',
      'approved',
      'published',
    ]);

    const manifest = await learner.call('content.manifest');
    expect(manifest.number).toBeGreaterThan(before);
    expect((await liveBundle()).items[itemId]).toBeDefined();
  });

  it('tells the writer, and can be found by search', async () => {
    const inbox = await eventually(
      async () => {
        const list = await writer.call('notifications.list', { query: {} });
        return list.items.some((n) => n.kind === 'submission') ? list : null;
      },
      { what: 'the "published" message' },
    );
    expect(inbox.items.map((n) => n.title)).toContain(`Published: ${title}`);

    const found = await eventually(
      async () => {
        const result = await learner.call('search.query', { query: { q: word, locale: 'en' } });
        return result.hits.some((h) => h.type === 'item' && h.id === itemId) ? result : null;
      },
      { what: 'search to know the new question' },
    );
    expect(found.hits[0]!.snippet).toContain(word);
  });

  it('can be answered by a learner, and writers see how it performs', async () => {
    const { answer } = rightAnswer(original);
    const result = await eventually(
      async () =>
        learner
          .call('practice.attempt', {
            body: {
              id: attemptId(),
              itemId,
              answer,
              hintLevel: 0,
              durationMs: 7_000,
              source: 'lesson',
              explainOption: null,
              solutionShown: false,
              attemptNo: 1,
              at: new Date().toISOString(),
            },
          })
          .catch(() => null),
      { what: 'the new question to be answerable' },
    );
    expect(result.correct).toBe(true);

    const stats = await eventually(
      async () => {
        const s = await writer.call('studio.analytics.items', {
          query: { conceptId: 'loops.counter' },
        });
        return s.items.some((i) => i.itemId === itemId) ? s : null;
      },
      { what: "the question to show in the writer's statistics" },
    );
    expect(stats.items.find((i) => i.itemId === itemId)).toMatchObject({ attempts: 1 });
  });

  it('can be taken out again by rolling back', async () => {
    const versions = await boss.call('admin.content.versions', { query: {} });
    const previous = versions.items.find(
      (v) => !v.current && v.number < versions.items[0]!.number,
    )!;
    await boss.call('admin.content.rollback', { params: { id: previous.id }, body: {} });
    await eventually(async () => (await liveBundle()).items[itemId] === undefined, {
      what: 'the question to leave the live curriculum',
    });
    // search follows the content
    await eventually(
      async () =>
        !(await learner.call('search.query', { query: { q: word, locale: 'en' } })).hits.some(
          (h) => h.id === itemId,
        ),
      { what: 'search to forget the question' },
    );
  });
});

describe.skipIf(!mailAvailable)("a child's account and a parent's consent", async () => {
  const boss = await admin();
  const year = new Date().getFullYear();

  async function child(name: string) {
    const actor = new Actor();
    const email = uniqueEmail('child');
    const parentEmail = uniqueEmail('parent');
    const result = await actor.call('auth.register', {
      body: {
        email,
        password: 'stack-password-1',
        name,
        birthYear: year - 12,
        locale: 'en',
        parentEmail,
      },
    });
    expect(result.status).toBe('pending_consent');
    return { actor, email, parentEmail };
  }

  const tokenIn = (mail: string) => /\/consent\/([A-Za-z0-9_-]{10,})/.exec(mail)?.[1];

  it('waits for a parent, who is asked by email', async () => {
    const kid = await child('Kabir Kid');
    const login = await refusal(
      kid.actor.call('auth.login', { body: { email: kid.email, password: 'stack-password-1' } }),
    );
    expect(login.status).toBe(403);
    expect(login.problem.type).toContain('consent-pending');

    const mail = await mailTo(kid.parentEmail, /Kabir Kid|consent|approve/i);
    expect(mail).toContain('Kabir Kid');
    const token = tokenIn(mail);
    expect(token, 'the mail should carry a link with a token').toBeDefined();

    const pending = await eventually(
      async () => {
        const list = await boss.call('admin.consent.list', { query: { limit: 100 } });
        return list.items.find((r) => r.parentEmail === kid.parentEmail) ?? null;
      },
      { what: 'the request in the admin list' },
    );
    expect(pending).toMatchObject({ childName: 'Kabir Kid', status: 'pending' });

    // the parent needs no account: the token is the proof
    const anonymous = new Actor();
    expect(await anonymous.call('consent.request', { params: { token: token! } })).toMatchObject({
      childName: 'Kabir Kid',
      status: 'pending',
    });
    const answered = await anonymous.call('consent.respond', {
      body: { token: token!, decision: 'grant' },
    });
    expect(answered.status).toBe('granted');

    // and now the child can start
    const session = await eventually(
      async () =>
        kid.actor
          .call('auth.login', { body: { email: kid.email, password: 'stack-password-1' } })
          .catch(() => null),
      { what: 'the child to be able to sign in' },
    );
    expect(session.user.status).toBe('active');
    kid.actor.tokens.save(session.tokens);
    await eventually(async () => kid.actor.call('profile.get').catch(() => null), {
      what: "the child's profile",
    });

    // children do not get API keys
    expect(
      (
        await refusal(
          kid.actor.call('developer.keys.create', {
            body: { name: 'Kid key', scopes: ['curriculum:read'] },
          }),
        )
      ).status,
    ).toBe(403);
  });

  it('is removed when the parent says no', async () => {
    const kid = await child('Dev Declined');
    const token = tokenIn(await mailTo(kid.parentEmail, /Dev Declined|consent|approve/i));
    const answered = await new Actor().call('consent.respond', {
      body: { token: token!, decision: 'deny' },
    });
    expect(answered.status).toBe('denied');
    await eventually(
      async () => {
        const error = await kid.actor
          .call('auth.login', { body: { email: kid.email, password: 'stack-password-1' } })
          .then(() => null)
          .catch((e: unknown) => e);
        return error instanceof ApiError && error.status === 401;
      },
      { what: 'the declined account to be gone' },
    );
    // a token works once
    expect(
      (
        await refusal(
          new Actor().call('consent.respond', { body: { token: token!, decision: 'grant' } }),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
});

describe('pictures', async () => {
  const boss = await admin();
  const writer = await newStaff(boss, 'writer', 'artist', 'Anya Artist');
  const learner = await newLearner('viewer');
  let assetId = '';
  let urls: Record<string, string> = {};

  const upload = (who: Actor, picture: Buffer, type: string, alt: string) => {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(picture)], { type }), 'gradient.png');
    form.set('alt', alt);
    return who.call('studio.media.upload', { body: form });
  };

  it('are uploaded by writers, in three sizes', async () => {
    const asset = await upload(writer, png(640, 480), 'image/png', 'A colour gradient');
    assetId = asset.id;
    urls = asset.urls;
    expect(asset).toMatchObject({
      filename: 'gradient.png',
      width: 640,
      height: 480,
      alt: 'A colour gradient',
      uploadedBy: writer.user!.id,
    });
    expect(asset.blurDataUrl).toMatch(/^data:image\//);
    expect(Object.keys(asset.urls).sort()).toEqual(['w1280', 'w320', 'w640']);
  });

  it('are served to anyone, as small modern images', async () => {
    for (const [variant, url] of Object.entries(urls)) {
      const res = await raw(new URL(url).pathname);
      expect(res.status, variant).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
      expect(res.headers.get('cache-control')).toContain('immutable');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
    const small = Buffer.from(await (await raw(new URL(urls.w320!).pathname)).arrayBuffer());
    const large = Buffer.from(await (await raw(new URL(urls.w640!).pathname)).arrayBuffer());
    expect(small.length).toBeLessThan(large.length);
  });

  it('are listed in the library, and only for writers', async () => {
    const library = await writer.call('studio.media.list', { query: {} });
    expect(library.items.map((a) => a.id)).toContain(assetId);
    expect((await refusal(learner.call('studio.media.list', { query: {} }))).status).toBe(403);
    expect((await refusal(upload(learner, png(8, 8), 'image/png', 'no'))).status).toBe(403);
  });

  it('refuse what is not a picture', async () => {
    const form = new FormData();
    form.set('file', new Blob(['just words'], { type: 'text/plain' }), 'notes.txt');
    form.set('alt', 'Notes');
    const error = await refusal(writer.call('studio.media.upload', { body: form }));
    expect(error.status).toBeGreaterThanOrEqual(400);
    expect(error.status).toBeLessThan(500);
  });

  it('can be deleted', async () => {
    await writer.call('studio.media.delete', { params: { id: assetId } });
    expect((await raw(new URL(urls.w320!).pathname)).status).toBe(404);
    expect(
      (await writer.call('studio.media.list', { query: {} })).items.map((a) => a.id),
    ).not.toContain(assetId);
  });
});

describe('feature flags', async () => {
  const boss = await admin();
  const writer = await newStaff(boss, 'writer', 'flagger');
  const learner = await newLearner('flagged');
  const key = `stack.beta-${stamp()}`;
  const change = {
    description: 'Used by the stack test',
    enabled: true,
    rolloutPercent: 100,
    roles: ['writer' as const],
    platforms: ['web' as const],
    minAppVersion: null,
    value: { banner: 'hello' },
  };

  it('start with the platform defaults', async () => {
    const list = await boss.call('admin.flags.list');
    expect(list.items.map((f) => f.key)).toContain('map.3d');
    const seen = await learner.call('flags.evaluate', { query: { platform: 'web' } });
    expect(seen.flags['map.3d']).toBeDefined();
  });

  it('can be created for a role and a platform, and change what people see', async () => {
    expect(
      (await refusal(learner.call('admin.flags.put', { params: { key }, body: change }))).status,
    ).toBe(403);
    const saved = await boss.call('admin.flags.put', { params: { key }, body: change });
    expect(saved).toMatchObject({ key, enabled: true, roles: ['writer'] });

    const asWriter = await writer.call('flags.evaluate', { query: { platform: 'web' } });
    expect(asWriter.flags[key]).toEqual({ on: true, value: { banner: 'hello' } });
    const asLearner = await learner.call('flags.evaluate', { query: { platform: 'web' } });
    expect(asLearner.flags[key]?.on ?? false).toBe(false);
    const onPhone = await writer.call('flags.evaluate', { query: { platform: 'android' } });
    expect(onPhone.flags[key]?.on ?? false).toBe(false);
    const anonymous = await new Actor().call('flags.evaluate', { query: { platform: 'web' } });
    expect(anonymous.flags[key]?.on ?? false).toBe(false);
  });

  it('can be switched off at once', async () => {
    await boss.call('admin.flags.put', { params: { key }, body: { ...change, rolloutPercent: 0 } });
    await eventually(
      async () =>
        !(await writer.call('flags.evaluate', { query: { platform: 'web' } })).flags[key]?.on,
      { what: 'the flag to turn off' },
    );
  });

  it('can be removed', async () => {
    await boss.call('admin.flags.delete', { params: { key } });
    expect((await boss.call('admin.flags.list')).items.map((f) => f.key)).not.toContain(key);
    const seen = await writer.call('flags.evaluate', { query: { platform: 'web' } });
    expect(seen.flags[key]).toBeUndefined();
  });
});

describe('the public API for developers', async () => {
  const boss = await admin();
  const dev = await newLearner('developer', 'Dee Developer');
  let keyId = '';
  let secret = '';
  const get = (path: string, key?: string) =>
    raw(`/public/v1${path}`, key ? { headers: { 'x-api-key': key } } : undefined);

  it('gives a key once, and stores only a hash', async () => {
    const created = await dev.call('developer.keys.create', {
      body: { name: 'Stack test', scopes: ['curriculum:read'] },
    });
    keyId = created.id;
    secret = created.secret;
    expect(secret).toMatch(/^lp_live_/);
    expect(created.prefix).toBe(secret.slice(0, created.prefix.length));
    expect(created).toMatchObject({ plan: 'free', usageToday: 0, revokedAt: null });
    const listed = await dev.call('developer.keys.list');
    expect(JSON.stringify(listed)).not.toContain(secret);
  });

  it('needs the key to read the curriculum', async () => {
    expect((await get('/curriculum')).status).toBe(401);
    expect((await get('/curriculum', 'lp_live_not-a-real-key-at-all')).status).toBe(401);
    // the app's own API does not take keys, and the public one does not take sessions
    const withSession = await raw('/public/v1/curriculum', {
      headers: { authorization: `Bearer ${dev.tokens.getAccessToken()}` },
    });
    expect(withSession.status).toBe(401);
  });

  it('serves the curriculum, a concept and its questions, and counts the requests', async () => {
    const curriculum = await get('/curriculum', secret);
    expect(curriculum.status).toBe(200);
    const limit = Number(curriculum.headers.get('x-quota-limit'));
    const left = Number(curriculum.headers.get('x-quota-remaining'));
    expect(limit).toBeGreaterThan(0);
    expect(left).toBe(limit - 1);
    const body = (await curriculum.json()) as { concepts: { id: string }[]; version: string };
    expect(body.concepts.map((c) => c.id)).toContain('loops.counter');

    const concept = await get('/concepts/loops.counter', secret);
    expect(concept.status).toBe(200);
    expect(Number(concept.headers.get('x-quota-remaining'))).toBe(left - 1);
    expect(((await concept.json()) as { concept: { id: string } }).concept.id).toBe(
      'loops.counter',
    );

    const items = await get('/items?concept=loops.counter', secret);
    expect(items.status).toBe(200);
    const list = (await items.json()) as { items: { id: string }[] };
    expect(list.items.length).toBeGreaterThan(0);
    // answer keys never leave through the public API
    expect(JSON.stringify(list)).not.toContain('"correct"');

    expect((await get('/concepts/nothing.here', secret)).status).toBe(404);
  });

  it('shows the owner the usage, and the admin the key', async () => {
    const mine = await eventually(
      async () => {
        const list = await dev.call('developer.keys.list');
        const key = list.items.find((k) => k.id === keyId);
        return key && key.usageToday >= 4 ? key : null;
      },
      { what: 'the key to show its usage' },
    );
    expect(mine.lastUsedAt).not.toBeNull();
    const usage = await dev.call('developer.keys.usage', { params: { id: keyId } });
    expect(usage.days.reduce((sum, d) => sum + d.requests, 0)).toBeGreaterThanOrEqual(4);

    const all = await boss.call('admin.apiKeys.list', { query: { limit: 100 } });
    expect(all.items.map((k) => k.id)).toContain(keyId);
    // someone else's key is invisible
    const other = await newLearner('other-dev');
    expect((await other.call('developer.keys.list')).items).toEqual([]);
    expect(
      (await refusal(other.call('developer.keys.usage', { params: { id: keyId } }))).status,
    ).toBe(404);
  });

  it('stops at the daily quota, which an admin can change', async () => {
    const used = (await dev.call('developer.keys.list')).items.find(
      (k) => k.id === keyId,
    )!.usageToday;
    await boss.call('admin.apiKeys.update', {
      params: { id: keyId },
      body: { plan: 'partner', dailyQuota: used + 2 },
    });
    expect((await get('/curriculum', secret)).status).toBe(200);
    const last = await get('/curriculum', secret);
    expect(last.status).toBe(200);
    expect(last.headers.get('x-quota-remaining')).toBe('0');
    const refused = await get('/curriculum', secret);
    expect(refused.status).toBe(429);
    const problem = (await refused.json()) as { title: string };
    expect(problem.title).toBeTruthy();
    await boss.call('admin.apiKeys.update', { params: { id: keyId }, body: { dailyQuota: 1000 } });
    expect((await get('/curriculum', secret)).status).toBe(200);
  });

  it('stops working when revoked', async () => {
    await dev.call('developer.keys.revoke', { params: { id: keyId } });
    expect((await get('/curriculum', secret)).status).toBe(401);
    const key = (await dev.call('developer.keys.list')).items.find((k) => k.id === keyId)!;
    expect(key.revokedAt).not.toBeNull();
  });
});

describe('who did what', async () => {
  const boss = await admin();
  const learner = await newLearner('curious');

  it('is recorded for every change an admin makes', async () => {
    const email = uniqueEmail('audited');
    const user = await boss.call('admin.users.create', {
      body: { email, name: 'Audited Person', role: 'writer', password: 'stack-password-1' },
    });
    const flag = `stack.audit-${stamp()}`;
    await boss.call('admin.flags.put', {
      params: { key: flag },
      body: {
        description: 'audit trail',
        enabled: false,
        rolloutPercent: 0,
        roles: [],
        platforms: [],
        minAppVersion: null,
        value: null,
      },
    });
    await boss.call('admin.users.update', {
      params: { id: user.id },
      body: { status: 'suspended' },
    });
    await boss.call('admin.flags.delete', { params: { key: flag } });

    const log = await eventually(
      async () => {
        const page = await boss.call('admin.audit.list', { query: { limit: 100 } });
        const mine = page.items.filter((e) => e.actorId === boss.user!.id);
        const has = (action: string, target: string) =>
          mine.some((e) => e.action === action && e.targetId === target);
        return has('user.created', user.id) &&
          has('user.updated', user.id) &&
          has('flag.created', flag) &&
          has('flag.deleted', flag)
          ? page
          : null;
      },
      { what: 'every action to be in the log' },
    );
    const created = log.items.find((e) => e.action === 'user.created' && e.targetId === user.id)!;
    expect(created).toMatchObject({ actorRole: 'admin', targetType: 'user' });
    expect(created.details).toMatchObject({ role: 'writer', email });
  });

  it('can be searched and paged, newest first', async () => {
    const first = await boss.call('admin.audit.list', { query: { limit: 2 } });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await boss.call('admin.audit.list', {
      query: { limit: 2, cursor: first.nextCursor! },
    });
    const ids = [...first.items, ...second.items].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const times = [...first.items, ...second.items].map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const onlyFlags = await boss.call('admin.audit.list', { query: { targetType: 'flag' } });
    expect(onlyFlags.items.length).toBeGreaterThan(0);
    expect(onlyFlags.items.every((e) => e.targetType === 'flag')).toBe(true);
  });

  it('is for admins only', async () => {
    expect((await refusal(learner.call('admin.audit.list', { query: {} }))).status).toBe(403);
    expect((await raw('/v1/admin/audit')).status).toBe(401);
  });
});

describe('the right to be forgotten', async () => {
  const boss = await admin();
  const email = uniqueEmail('leaver');
  const leaver = new Actor();
  const registered = await leaver.call('auth.register', {
    body: {
      email,
      password: 'stack-password-1',
      name: 'Lee Leaver',
      birthYear: 1990,
      locale: 'en',
    },
  });
  if (registered.status !== 'active') throw new Error('an adult should be active at once');
  leaver.tokens.save(registered.tokens);
  leaver.user = registered.user;

  it('holds a copy of everything, from every service', async () => {
    const bundle = await liveBundle();
    const item = bundle.items[bundle.lessons['loops.counter']!.practice[0]!]!;
    const { answer, explainOption } = rightAnswer(item);
    await leaver.call('practice.attempt', {
      body: {
        id: attemptId(),
        itemId: item.id,
        answer,
        hintLevel: 0,
        durationMs: 9_000,
        source: 'lesson',
        explainOption,
        solutionShown: false,
        attemptNo: 1,
        at: new Date().toISOString(),
      },
    });
    await eventually(async () => (await leaver.call('rewards.me')).xp > 0, { what: 'XP' });
    await leaver.call('developer.keys.create', {
      body: { name: 'Leaver key', scopes: ['curriculum:read'] },
    });

    const exported = await leaver.call('privacy.export');
    expect(exported.userId).toBe(leaver.user!.id);
    for (const service of PRIVACY_SERVICES) {
      expect(exported.services, `the export should include ${service}`).toHaveProperty(service);
      expect(exported.services[service], `${service} should answer`).not.toEqual({
        unavailable: true,
      });
    }
    expect(JSON.stringify(exported.services.identity)).toContain(email);
    expect(JSON.stringify(exported.services.practice)).toContain(item.id);
    expect(JSON.stringify(exported.services.developer)).toContain('Leaver key');
  });

  it('is granted: every service erases what it holds, and says so', async () => {
    const started = await leaver.call('privacy.delete');
    expect(started.status).toBe('pending');
    expect(started.services.map((s) => s.service).sort()).toEqual(
      [...PRIVACY_SERVICES, 'consent'].sort(),
    );

    const done = await eventually(
      async () => {
        // the progress page is public: it works after the account is gone
        const status = await new Actor().call('privacy.deletion', {
          params: { id: started.requestId },
        });
        return status.status === 'completed' ? status : null;
      },
      { what: 'every service to finish erasing', timeoutMs: 45_000 },
    );
    expect(done.services.every((s) => s.completedAt !== null)).toBe(true);
  });

  it('leaves nothing to sign in to, and the address is free again', async () => {
    const error = await refusal(
      new Actor().call('auth.login', { body: { email, password: 'stack-password-1' } }),
    );
    expect(error.status).toBe(401);
    expect(
      (await refusal(boss.call('admin.users.get', { params: { id: leaver.user!.id } }))).status,
    ).toBe(404);
    const again = await newLearnerWith(email);
    expect(again.status).toBe('active');
  });
});

async function newLearnerWith(email: string) {
  return new Actor().call('auth.register', {
    body: { email, password: 'stack-password-2', name: 'Lee Again', birthYear: 1990, locale: 'en' },
  });
}
