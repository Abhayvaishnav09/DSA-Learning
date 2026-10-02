import { createHash, randomBytes, randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import { identity, Ok, Problem, type EventEnvelope } from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import {
  badRequest,
  conflict,
  decodeCursor,
  encodeCursor,
  forbidden,
  HttpProblem,
  notFound,
  requireInternal,
  requireRole,
  requireUser,
  unauthorized,
  type ServiceContext,
  type ServiceDefinition,
  type Tx,
} from '@logicpath/service-kit';
import { hash, verify } from '@node-rs/argon2';
import { and, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { ACCESS_TOKEN_SECONDS, loadKeyRing, signAccessToken, type KeyRing } from './keys';
import { oneTimeTokens, refreshTokens, users } from './schema';

export const env = {
  SIGNING_KEY_JWK: z.string().optional(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADULT_AGE: z.coerce.number().int().default(18),
};
export type IdentityConfig = ReturnType<typeof loadConfig<typeof env>>;

const REFRESH_DAYS = 30;
const REFRESH_COOKIE = 'lp_refresh';
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

type UserRow = typeof users.$inferSelect;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const newSecret = () => randomBytes(32).toString('base64url');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function toUser(row: UserRow): identity.User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

const problems = {
  400: Problem,
  401: Problem,
  403: Problem,
  404: Problem,
  409: Problem,
  429: Problem,
};

export function identityService(config: IdentityConfig): ServiceDefinition<IdentityConfig> {
  let ring: Promise<KeyRing> | null = null;
  const keys = (): JWTVerifyGetKey => async (header, token) =>
    (await ring!).verifyKeys(header, token);

  return {
    title: 'LogicPath Identity',
    description:
      'Accounts, roles, sign-in, rotating refresh tokens and the public signing keys (JWKS).',
    config,
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    keys,
    routes: async (app, ctx) => {
      ring = loadKeyRing(ctx.db, config.SIGNING_KEY_JWK);
      await ring;
      await app.register(cookie);
      await bootstrapAdmin(ctx);
      registerRoutes(app, ctx, () => ring!);
    },
    consumers: (ctx) => [
      {
        name: 'identity',
        types: ['consent.granted', 'consent.denied', 'privacy.deletion.requested'],
        handle: (event) => handleEvent(ctx, event),
      },
    ],
  };
}

async function bootstrapAdmin(ctx: ServiceContext<IdentityConfig>) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = ctx.config;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const email = normalizeEmail(ADMIN_EMAIL);
  const existing = await ctx.db.select().from(users).where(eq(users.email, email));
  if (existing.length > 0) return;
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        email,
        name: 'Admin',
        passwordHash: await hash(ADMIN_PASSWORD),
        role: 'admin',
        status: 'active',
        birthYear: 1990,
        emailVerifiedAt: new Date(),
      })
      .returning();
    await announceRegistered(ctx, tx, row!);
  });
  ctx.log.info({ email }, 'bootstrap admin created');
}

async function announceRegistered(ctx: ServiceContext<IdentityConfig>, tx: Tx, row: UserRow) {
  await ctx.emit(tx, 'identity.user.registered', {
    userId: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locale: row.locale,
    birthYear: row.birthYear,
    minor: row.status === 'pending_consent',
    parentEmail: row.parentEmail,
    status: row.status,
  });
}

async function handleEvent(ctx: ServiceContext<IdentityConfig>, event: EventEnvelope) {
  await ctx.once('identity', event, async (tx) => {
    if (event.type === 'consent.granted') {
      const { userId } = event.data as { userId: string };
      const [row] = await tx
        .update(users)
        .set({ status: 'active' })
        .where(and(eq(users.id, userId), eq(users.status, 'pending_consent')))
        .returning();
      if (row) {
        await ctx.emit(tx, 'identity.user.status_changed', {
          userId,
          status: 'active',
          previousStatus: 'pending_consent',
        });
      }
    } else if (event.type === 'consent.denied') {
      // A minor's account without parental consent must not be kept (DPDP Rules 2025).
      const { userId } = event.data as { userId: string };
      await tx.delete(users).where(and(eq(users.id, userId), eq(users.status, 'pending_consent')));
    } else if (event.type === 'privacy.deletion.requested') {
      const { userId, requestId } = event.data as { userId: string; requestId: string };
      await tx.delete(users).where(eq(users.id, userId));
      await ctx.emit(tx, 'privacy.deletion.completed', { requestId, userId, service: 'identity' });
    }
  });
}

function registerRoutes(
  app: Parameters<ServiceDefinition<IdentityConfig>['routes']>[0],
  ctx: ServiceContext<IdentityConfig>,
  keyRing: () => Promise<KeyRing>,
) {
  const { db, config } = ctx;
  const isWeb = (req: FastifyRequest) => req.headers['x-client'] === 'web';

  async function issueTokens(
    tx: Tx,
    user: UserRow,
    req: FastifyRequest,
    reply: FastifyReply,
    familyId: string = randomUUID(),
  ): Promise<identity.Tokens> {
    const secret = newSecret();
    await tx.insert(refreshTokens).values({
      userId: user.id,
      familyId,
      tokenHash: sha256(secret),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 86_400_000),
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
    });
    const accessToken = await signAccessToken(
      await keyRing(),
      user,
      config.JWT_ISSUER,
      config.JWT_AUDIENCE,
    );
    if (isWeb(req)) {
      reply.setCookie(REFRESH_COOKIE, secret, {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: 'strict',
        path: '/v1/auth',
        maxAge: REFRESH_DAYS * 86_400,
      });
      return { accessToken, expiresIn: ACCESS_TOKEN_SECONDS };
    }
    return { accessToken, expiresIn: ACCESS_TOKEN_SECONDS, refreshToken: secret };
  }

  async function createOneTimeToken(
    tx: Tx,
    userId: string,
    kind: 'verify_email' | 'reset_password',
  ) {
    const secret = newSecret();
    const hours = kind === 'verify_email' ? 72 : 1;
    await tx.insert(oneTimeTokens).values({
      userId,
      kind,
      tokenHash: sha256(secret),
      expiresAt: new Date(Date.now() + hours * 3_600_000),
    });
    return secret;
  }

  async function useOneTimeToken(tx: Tx, token: string, kind: 'verify_email' | 'reset_password') {
    const [row] = await tx
      .update(oneTimeTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(oneTimeTokens.tokenHash, sha256(token)),
          eq(oneTimeTokens.kind, kind),
          isNull(oneTimeTokens.usedAt),
          sql`${oneTimeTokens.expiresAt} > now()`,
        ),
      )
      .returning();
    if (!row) throw badRequest('This link is invalid or has expired');
    return row.userId;
  }

  app.get('/.well-known/jwks.json', { schema: { hide: true } }, async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return (await keyRing()).jwks;
  });

  app.post(
    '/v1/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create a student account',
        description:
          'Learners under 18 need a parent email; their account stays `pending_consent` until the parent approves (DPDP Act).',
        body: identity.RegisterRequest,
        response: { 201: identity.RegisterResponse, ...problems },
      },
    },
    async (req, reply) => {
      const body = req.body;
      const email = normalizeEmail(body.email);
      const age = new Date().getUTCFullYear() - body.birthYear;
      if (age < 5 || age > 120)
        throw badRequest('birthYear looks wrong', [
          { path: 'body.birthYear', message: 'not a plausible birth year' },
        ]);
      const minor = age < config.ADULT_AGE;
      if (minor && !body.parentEmail) {
        throw badRequest('Learners under 18 need a parent or guardian email', [
          { path: 'body.parentEmail', message: 'required for learners under 18' },
        ]);
      }
      if (minor && normalizeEmail(body.parentEmail!) === email) {
        throw badRequest('The parent email must be different from the learner email');
      }
      const passwordHash = await hash(body.password);
      const result = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(users)
          .values({
            email,
            name: body.name,
            passwordHash,
            role: 'student',
            status: minor ? 'pending_consent' : 'active',
            birthYear: body.birthYear,
            locale: body.locale,
            parentEmail: minor ? normalizeEmail(body.parentEmail!) : null,
          })
          .onConflictDoNothing()
          .returning();
        const row = inserted[0];
        if (!row) throw conflict('An account with this email already exists');
        await announceRegistered(ctx, tx, row);
        const token = await createOneTimeToken(tx, row.id, 'verify_email');
        await ctx.emit(tx, 'identity.user.email_verification_requested', {
          userId: row.id,
          email: row.email,
          name: row.name,
          locale: row.locale,
          token,
        });
        if (minor) {
          return {
            status: 'pending_consent' as const,
            user: toUser(row),
            message: 'We emailed your parent or guardian. You can sign in after they approve.',
          };
        }
        return {
          status: 'active' as const,
          user: toUser(row),
          tokens: await issueTokens(tx, row, req, reply),
        };
      });
      return reply.status(201).send(result);
    },
  );

  app.post(
    '/v1/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign in with email and password',
        body: identity.LoginRequest,
        response: { 200: identity.Session, ...problems },
      },
    },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      const [row] = await db.select().from(users).where(eq(users.email, email));
      const invalid = new HttpProblem(
        401,
        'invalid-credentials',
        'Unauthorized',
        'Email or password is wrong',
      );
      if (!row) {
        await hash(req.body.password); // same work either way: no account-existence timing leak
        throw invalid;
      }
      if (row.lockedUntil && row.lockedUntil > new Date()) {
        throw new HttpProblem(
          429,
          'locked',
          'Too many attempts',
          `Try again after ${row.lockedUntil.toISOString()}`,
        );
      }
      if (!(await verify(row.passwordHash, req.body.password))) {
        const failed = row.failedLogins + 1;
        await db
          .update(users)
          .set({
            failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
            lockedUntil:
              failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          })
          .where(eq(users.id, row.id));
        throw invalid;
      }
      if (row.status === 'suspended') throw forbidden('This account is suspended');
      if (row.status === 'pending_consent') {
        throw new HttpProblem(
          403,
          'consent-pending',
          'Forbidden',
          'Waiting for a parent or guardian to approve this account',
        );
      }
      const tokens = await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ failedLogins: 0, lockedUntil: null })
          .where(eq(users.id, row.id));
        return issueTokens(tx, row, req, reply);
      });
      return { user: toUser(row), tokens };
    },
  );

  app.post(
    '/v1/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Swap a refresh token for new tokens',
        description:
          'Refresh tokens are single use. Reusing an old one signs out every device in that session family.',
        body: identity.RefreshRequest.optional(),
        response: { 200: identity.Session, ...problems },
      },
    },
    async (req, reply) => {
      const secret = req.body?.refreshToken ?? req.cookies[REFRESH_COOKIE];
      if (!secret) throw unauthorized('No refresh token');
      const outcome = await db.transaction(async (tx) => {
        const [token] = await tx
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, sha256(secret)))
          .for('update');
        if (!token) throw unauthorized('Refresh token not recognised');
        if (token.revokedAt) return { reused: token, session: null };
        if (token.expiresAt < new Date()) throw unauthorized('Session expired');
        const [user] = await tx.select().from(users).where(eq(users.id, token.userId));
        if (!user || user.status !== 'active') throw unauthorized('Account is not active');
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.id, token.id));
        return {
          reused: null,
          session: {
            user: toUser(user),
            tokens: await issueTokens(tx, user, req, reply, token.familyId),
          },
        };
      });
      if (outcome.reused) {
        // Reuse of a rotated token means it leaked: revoke the whole family. This must commit,
        // so it runs outside the transaction above, before answering 401.
        const { familyId, userId } = outcome.reused;
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
        ctx.log.warn({ userId }, 'refresh token reuse detected; family revoked');
        throw unauthorized('Session ended for safety. Please sign in again');
      }
      return outcome.session!;
    },
  );

  app.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign out this device',
        body: identity.RefreshRequest.optional(),
        response: { 200: Ok },
      },
    },
    async (req, reply) => {
      const secret = req.body?.refreshToken ?? req.cookies[REFRESH_COOKIE];
      if (secret) {
        const [token] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, sha256(secret)));
        if (token) {
          await db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(
              and(eq(refreshTokens.familyId, token.familyId), isNull(refreshTokens.revokedAt)),
            );
        }
      }
      reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
      return { ok: true as const };
    },
  );

  app.post(
    '/v1/auth/verify-email',
    {
      schema: {
        tags: ['auth'],
        summary: 'Confirm an email address',
        body: identity.TokenRequest,
        response: { 200: Ok, ...problems },
      },
    },
    async (req) => {
      await db.transaction(async (tx) => {
        const userId = await useOneTimeToken(tx, req.body.token, 'verify_email');
        await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
      });
      return { ok: true as const };
    },
  );

  app.post(
    '/v1/auth/password/forgot',
    {
      schema: {
        tags: ['auth'],
        summary: 'Email a password reset link',
        description: 'Always answers 202, whether or not the email has an account.',
        body: identity.ForgotPasswordRequest,
        response: { 202: Ok },
      },
    },
    async (req, reply) => {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizeEmail(req.body.email)));
      if (row && row.status !== 'suspended') {
        await db.transaction(async (tx) => {
          const token = await createOneTimeToken(tx, row.id, 'reset_password');
          await ctx.emit(tx, 'identity.user.password_reset_requested', {
            userId: row.id,
            email: row.email,
            name: row.name,
            locale: row.locale,
            token,
          });
        });
      }
      return reply.status(202).send({ ok: true as const });
    },
  );

  app.post(
    '/v1/auth/password/reset',
    {
      schema: {
        tags: ['auth'],
        summary: 'Set a new password from a reset link',
        body: identity.ResetPasswordRequest,
        response: { 200: Ok, ...problems },
      },
    },
    async (req) => {
      const passwordHash = await hash(req.body.password);
      await db.transaction(async (tx) => {
        const userId = await useOneTimeToken(tx, req.body.token, 'reset_password');
        await tx
          .update(users)
          .set({ passwordHash, failedLogins: 0, lockedUntil: null })
          .where(eq(users.id, userId));
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      });
      return { ok: true as const };
    },
  );

  app.get(
    '/v1/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'The signed-in user',
        security: [{ bearer: [] }],
        response: { 200: identity.User, ...problems },
      },
    },
    async (req) => {
      const me = requireUser(req);
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      if (!row) throw notFound('User');
      return toUser(row);
    },
  );

  // ---------- admin ----------

  app.get(
    '/v1/admin/users',
    {
      schema: {
        tags: ['admin'],
        summary: 'List and search users',
        security: [{ bearer: [] }],
        querystring: identity.AdminUserQuery,
        response: { 200: identity.UserPage, ...problems },
      },
    },
    async (req) => {
      requireRole(req, 'admin');
      const { q, role, status, limit } = req.query;
      const cursor = decodeCursor<{ c: string; id: string }>(req.query.cursor);
      const filters = [
        q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined,
        role ? eq(users.role, role) : undefined,
        status ? eq(users.status, status) : undefined,
        cursor
          ? or(
              lt(users.createdAt, new Date(cursor.c)),
              and(eq(users.createdAt, new Date(cursor.c)), lt(users.id, cursor.id)),
            )
          : undefined,
      ].filter((f) => f !== undefined);
      const rows = await db
        .select()
        .from(users)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toUser),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
            : null,
      };
    },
  );

  app.post(
    '/v1/admin/users',
    {
      schema: {
        tags: ['admin'],
        summary: 'Create a user with a role (e.g. a content writer)',
        security: [{ bearer: [] }],
        body: identity.AdminCreateUser,
        response: { 201: identity.User, ...problems },
      },
    },
    async (req, reply) => {
      const admin = requireRole(req, 'admin');
      const passwordHash = await hash(req.body.password);
      const row = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            email: normalizeEmail(req.body.email),
            name: req.body.name,
            passwordHash,
            role: req.body.role,
            status: 'active',
            birthYear: 1990,
            emailVerifiedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning();
        if (!created) throw conflict('An account with this email already exists');
        await announceRegistered(ctx, tx, created);
        await ctx.emit(tx, 'audit.recorded', {
          actorId: admin.id,
          actorRole: admin.role,
          action: 'user.created',
          targetType: 'user',
          targetId: created.id,
          details: { role: created.role, email: created.email },
          at: new Date().toISOString(),
        });
        return created;
      });
      return reply.status(201).send(toUser(row));
    },
  );

  app.patch(
    '/v1/admin/users/:id',
    {
      schema: {
        tags: ['admin'],
        summary: "Change a user's role or suspend / reactivate them",
        security: [{ bearer: [] }],
        params: z.object({ id: z.uuid() }),
        body: identity.AdminUserUpdate,
        response: { 200: identity.User, ...problems },
      },
    },
    async (req) => {
      const admin = requireRole(req, 'admin');
      if (req.params.id === admin.id) throw forbidden('You cannot change your own role or status');
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(users)
          .where(eq(users.id, req.params.id))
          .for('update');
        if (!before) throw notFound('User');
        if (before.status === 'pending_consent' && req.body.status)
          throw conflict('This account is waiting for parental consent');
        const [after] = await tx
          .update(users)
          .set({
            ...(req.body.role ? { role: req.body.role } : {}),
            ...(req.body.status ? { status: req.body.status } : {}),
          })
          .where(eq(users.id, before.id))
          .returning();
        if (req.body.role && req.body.role !== before.role) {
          await ctx.emit(tx, 'identity.user.role_changed', {
            userId: before.id,
            role: req.body.role,
            previousRole: before.role,
          });
        }
        if (req.body.status && req.body.status !== before.status) {
          await ctx.emit(tx, 'identity.user.status_changed', {
            userId: before.id,
            status: req.body.status,
            previousStatus: before.status,
          });
          if (req.body.status === 'suspended') {
            await tx
              .update(refreshTokens)
              .set({ revokedAt: new Date() })
              .where(and(eq(refreshTokens.userId, before.id), isNull(refreshTokens.revokedAt)));
          }
        }
        await ctx.emit(tx, 'audit.recorded', {
          actorId: admin.id,
          actorRole: admin.role,
          action: 'user.updated',
          targetType: 'user',
          targetId: before.id,
          details: {
            from: { role: before.role, status: before.status },
            to: { role: after!.role, status: after!.status },
          },
          at: new Date().toISOString(),
        });
        return toUser(after!);
      });
    },
  );

  // ---------- internal ----------

  app.get(
    '/internal/users/:id/export',
    { schema: { hide: true, params: z.object({ id: z.uuid() }) } },
    async (req) => {
      requireInternal(req, config);
      const [row] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!row) return { service: 'identity', data: null };
      const sessions = await db
        .select({
          createdAt: refreshTokens.createdAt,
          userAgent: refreshTokens.userAgent,
          revokedAt: refreshTokens.revokedAt,
        })
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, row.id));
      return {
        service: 'identity',
        data: {
          ...toUser(row),
          birthYear: row.birthYear,
          locale: row.locale,
          parentEmail: row.parentEmail,
          sessions,
        },
      };
    },
  );
}
