import { fail, type LocalHandler, type LocalUser } from '@logicpath/api-client/local';
import type { identity, ParamsOf, Role } from '@logicpath/contracts';
import type { LocalDb, UserRow } from '../db';
import { notify, say } from './engage';
import {
  audit,
  conflict,
  forbidden,
  invalid,
  iso,
  me,
  notFound,
  paginate,
  randomToken,
  sha256,
  uuid,
} from '../util';

const ADULT_AGE = 18;
const TOKEN_HOURS = 24;
/** A parent has a week to answer. */
export const CONSENT_DAYS = 7;
const SESSION_DAYS = 30;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** The demo has no email: messages land in a mailbox the sign-in screens show (see DemoMailbox). */
export function sendMail(
  db: LocalDb,
  mail: { to: string; subject: string; body: string; link?: string },
  now: Date,
) {
  db.t.mailbox.unshift({ id: uuid(), link: mail.link ?? null, at: iso(now), ...mail });
  db.t.mailbox = db.t.mailbox.slice(0, 20);
}

function issueToken(db: LocalDb, kind: 'verify' | 'reset', userId: string, now: Date): string {
  const token = randomToken(`lp_${kind}_`);
  db.t.tokens[token] = {
    kind,
    userId,
    expiresAt: iso(new Date(now.getTime() + TOKEN_HOURS * 3_600_000)),
  };
  return token;
}

function useToken(db: LocalDb, token: string, kind: 'verify' | 'reset', now: Date) {
  const row = db.t.tokens[token];
  if (!row || row.kind !== kind || row.expiresAt < iso(now)) {
    throw fail(400, 'Bad request', 'This link has expired or was already used', 'token');
  }
  delete db.t.tokens[token];
  return row;
}

export const toUser = (row: UserRow): identity.User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  emailVerified: row.emailVerified,
  createdAt: row.createdAt,
});

export async function createUser(
  db: LocalDb,
  input: {
    email: string;
    password: string;
    name: string;
    role: Role;
    birthYear: number;
    locale?: 'en' | 'hi-Latn';
    parentEmail?: string | null;
    status?: UserRow['status'];
  },
  now: Date,
): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  if (Object.values(db.t.users).some((u) => u.email === email)) {
    throw conflict('An account with this email already exists');
  }
  const salt = randomToken('');
  const row: UserRow = {
    id: uuid(),
    email,
    name: input.name.trim(),
    role: input.role,
    status: input.status ?? 'active',
    emailVerified: false,
    createdAt: iso(now),
    passwordHash: await sha256(`${salt}:${input.password}`),
    salt,
    birthYear: input.birthYear,
    locale: input.locale ?? 'en',
    parentEmail: input.parentEmail ?? null,
  };
  db.t.users[row.id] = row;
  db.t.profiles[row.id] = {
    userId: row.id,
    displayName: row.name,
    locale: row.locale,
    timeZone: 'Asia/Kolkata',
    dailyGoalMinutes: 10,
    theme: 'system',
    updatedAt: iso(now),
  };
  db.touch();
  return row;
}

export function welcome(db: LocalDb, row: UserRow, now: Date) {
  notify(
    db,
    row.id,
    {
      kind: 'system',
      title: say(row.locale, 'Welcome to LogicPath!', 'LogicPath me swagat hai!'),
      body: say(
        row.locale,
        'Start with the first lesson. A few minutes a day is enough.',
        'Pehle lesson se shuru karo. Roz kuch minute kaafi hain.',
      ),
      link: '/learn',
    },
    now,
  );
}

function issueSession(db: LocalDb, row: UserRow, now: Date): identity.Session {
  const accessToken = randomToken('lp_local_');
  db.t.sessions[accessToken] = {
    userId: row.id,
    expiresAt: iso(new Date(now.getTime() + SESSION_DAYS * 86_400_000)),
  };
  db.touch();
  return { user: toUser(row), tokens: { accessToken, expiresIn: SESSION_DAYS * 86_400 } };
}

export function authenticate(db: LocalDb, token: string, now = new Date()): LocalUser | null {
  const session = db.t.sessions[token];
  if (!session || session.expiresAt < iso(now)) return null;
  const row = db.t.users[session.userId];
  if (!row || row.status !== 'active') return null;
  return { id: row.id, role: row.role, name: row.name };
}

export function identityHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'auth.register': async (ctx, { body }) => {
      const input = body as identity.RegisterRequest;
      const age = ctx.now.getUTCFullYear() - input.birthYear;
      if (age < 5 || age > 120) {
        throw invalid('birthYear looks wrong', [
          { path: 'body.birthYear', message: 'not a plausible birth year' },
        ]);
      }
      const minor = age < ADULT_AGE;
      if (minor && !input.parentEmail) {
        throw invalid('Learners under 18 need a parent or guardian email', [
          { path: 'body.parentEmail', message: 'required for learners under 18' },
        ]);
      }
      const row = await createUser(
        db,
        {
          ...input,
          role: 'student',
          status: minor ? 'pending_consent' : 'active',
          parentEmail: minor ? normalizeEmail(input.parentEmail!) : null,
        },
        ctx.now,
      );
      const verify = issueToken(db, 'verify', row.id, ctx.now);
      sendMail(
        db,
        {
          to: row.email,
          subject: 'Confirm your email',
          body: `Hi ${row.name}, confirm your email address for LogicPath.`,
          link: `/verify-email?token=${verify}`,
        },
        ctx.now,
      );
      if (minor) {
        const token = randomToken('lp_consent_');
        db.t.consents.unshift({
          id: uuid(),
          userId: row.id,
          token,
          parentEmail: row.parentEmail!,
          childName: row.name,
          status: 'pending',
          requestedAt: iso(ctx.now),
        });
        sendMail(
          db,
          {
            to: row.parentEmail!,
            subject: `Please approve ${row.name}'s LogicPath account`,
            body: `${row.name} would like to learn on LogicPath. Because they are under 18, we need a parent or guardian to say yes before the account starts.`,
            link: `/consent/${token}`,
          },
          ctx.now,
        );
        db.touch();
        return {
          status: 'pending_consent',
          user: toUser(row),
          message: 'We emailed your parent or guardian. You can sign in after they approve.',
        };
      }
      welcome(db, row, ctx.now);
      return { status: 'active', ...issueSession(db, row, ctx.now) };
    },

    'auth.login': async (ctx, { body }) => {
      const { email, password } = body as { email: string; password: string };
      const row = Object.values(db.t.users).find((u) => u.email === normalizeEmail(email));
      const wrong = fail(401, 'Unauthorized', 'Email or password is wrong', 'invalid-credentials');
      if (!row || (await sha256(`${row.salt}:${password}`)) !== row.passwordHash) throw wrong;
      if (row.status === 'suspended') throw forbidden('This account is suspended');
      if (row.status === 'pending_consent') {
        throw fail(
          403,
          'Forbidden',
          'Waiting for a parent or guardian to approve this account',
          'consent-pending',
        );
      }
      return issueSession(db, row, ctx.now);
    },

    // Locally the access token is long-lived, so "refresh" just confirms the session.
    'auth.refresh': (ctx) => {
      const user = ctx.token ? authenticate(db, ctx.token, ctx.now) : null;
      if (!user) throw fail(401, 'Unauthorized', 'Sign in again', 'unauthorized');
      return {
        user: toUser(db.t.users[user.id]!),
        tokens: { accessToken: ctx.token!, expiresIn: SESSION_DAYS * 86_400 },
      };
    },

    'auth.logout': (ctx) => {
      if (ctx.token) delete db.t.sessions[ctx.token];
      db.touch();
      return { ok: true };
    },

    'auth.verifyEmail': (ctx, { body }) => {
      const { token } = body as identity.TokenRequest;
      const { userId } = useToken(db, token, 'verify', ctx.now);
      const row = db.t.users[userId];
      if (row) row.emailVerified = true;
      db.touch();
      return { ok: true };
    },
    // The answer is the same whether or not the address has an account (no way to probe for users).
    'auth.forgotPassword': (ctx, { body }) => {
      const { email } = body as identity.ForgotPasswordRequest;
      const row = Object.values(db.t.users).find((u) => u.email === normalizeEmail(email));
      if (row && row.status !== 'pending_consent') {
        const token = issueToken(db, 'reset', row.id, ctx.now);
        sendMail(
          db,
          {
            to: row.email,
            subject: 'Reset your password',
            body: 'Someone asked to reset the password for this LogicPath account. If it was you, use the link.',
            link: `/reset-password?token=${token}`,
          },
          ctx.now,
        );
        db.touch();
      }
      return { ok: true };
    },
    'auth.resetPassword': async (ctx, { body }) => {
      const { token, password } = body as identity.ResetPasswordRequest;
      const { userId } = useToken(db, token, 'reset', ctx.now);
      const row = db.t.users[userId];
      if (!row) throw notFound('Account');
      row.salt = randomToken('');
      row.passwordHash = await sha256(`${row.salt}:${password}`);
      // A new password signs every device out.
      for (const [t, s] of Object.entries(db.t.sessions))
        if (s.userId === userId) delete db.t.sessions[t];
      db.touch();
      return { ok: true };
    },

    'auth.me': (ctx) => toUser(db.t.users[me(ctx).id]!),

    'admin.users.list': (_ctx, { query }) => {
      const { q, role, status } = query as { q?: string; role?: Role; status?: UserRow['status'] };
      const needle = q?.toLowerCase();
      const rows = Object.values(db.t.users)
        .filter(
          (u) =>
            (!needle || u.email.includes(needle) || u.name.toLowerCase().includes(needle)) &&
            (!role || u.role === role) &&
            (!status || u.status === status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(rows, query);
      return { items: page.items.map(toUser), nextCursor: page.nextCursor };
    },

    'admin.users.create': async (ctx, { body }) => {
      const input = body as { email: string; name: string; role: Role; password: string };
      const row = await createUser(
        db,
        { ...input, birthYear: ctx.now.getUTCFullYear() - 30 },
        ctx.now,
      );
      audit(
        db,
        me(ctx),
        'user.created',
        'user',
        row.id,
        { role: row.role, email: row.email },
        ctx.now,
      );
      return toUser(row);
    },

    'admin.users.update': (ctx, { params, body }) => {
      const admin = me(ctx);
      const { id } = params as ParamsOf<'admin.users.update'>;
      const row = db.t.users[id];
      if (row?.id === admin.id) throw forbidden('You cannot change your own role or status');
      if (!row) throw notFound('User');
      const change = body as { role?: Role; status?: 'active' | 'suspended' };
      if (row.status === 'pending_consent' && change.status) {
        throw conflict('This account is waiting for parental consent');
      }
      const before = { role: row.role, status: row.status };
      if (change.role) row.role = change.role;
      if (change.status) row.status = change.status;
      // Suspending ends every session at once.
      if (change.status === 'suspended') {
        for (const [token, s] of Object.entries(db.t.sessions))
          if (s.userId === id) delete db.t.sessions[token];
      }
      audit(
        db,
        admin,
        'user.updated',
        'user',
        id,
        { from: before, to: { role: row.role, status: row.status } },
        ctx.now,
      );
      db.touch();
      return toUser(row);
    },
  };
}
