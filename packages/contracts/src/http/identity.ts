import { z } from 'zod';
import { Id, IsoDateTime, Locale, Role, page } from '../common';

export const UserStatus = z.enum(['active', 'pending_consent', 'suspended']);

export const User = z
  .object({
    id: Id,
    email: z.email(),
    name: z.string(),
    role: Role,
    status: UserStatus,
    emailVerified: z.boolean(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'User' });
export type User = z.infer<typeof User>;

const Password = z.string().min(8).max(200).describe('At least 8 characters');

export const RegisterRequest = z
  .object({
    email: z.email(),
    password: Password,
    name: z.string().trim().min(1).max(80),
    birthYear: z.number().int().min(1900).max(2100),
    locale: Locale.default('en'),
    parentEmail: z
      .email()
      .optional()
      .describe('Required when the learner is under 18 (DPDP Act: verifiable parental consent)'),
  })
  .meta({ id: 'RegisterRequest' });

export const Tokens = z
  .object({
    accessToken: z.string().describe('JWT (EdDSA). Send as `Authorization: Bearer <token>`'),
    expiresIn: z.number().int().describe('Seconds until the access token expires'),
    refreshToken: z
      .string()
      .optional()
      .describe(
        'Opaque, single use. Omitted for web clients (`X-Client: web`), which get an httpOnly cookie',
      ),
  })
  .meta({ id: 'Tokens' });

export const Session = z.object({ user: User, tokens: Tokens }).meta({ id: 'Session' });

export const RegisterResponse = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('active'), user: User, tokens: Tokens }),
    z.object({
      status: z.literal('pending_consent'),
      user: User,
      message: z.string().describe('A consent email was sent to the parent'),
    }),
  ])
  .meta({ id: 'RegisterResponse' });

export const LoginRequest = z
  .object({ email: z.email(), password: z.string().min(1) })
  .meta({ id: 'LoginRequest' });

export const RefreshRequest = z
  .object({
    refreshToken: z
      .string()
      .optional()
      .describe('Mobile clients send it here; web clients rely on the cookie'),
  })
  .meta({ id: 'RefreshRequest' });

export const TokenRequest = z.object({ token: z.string().min(10) });
export const ForgotPasswordRequest = z.object({ email: z.email() });
export const ResetPasswordRequest = z.object({ token: z.string().min(10), password: Password });

export const AdminUserQuery = z.object({
  q: z.string().optional().describe('Search by email or name'),
  role: Role.optional(),
  status: UserStatus.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const UserPage = page(User).meta({ id: 'UserPage' });

export const AdminUserUpdate = z
  .object({ role: Role.optional(), status: z.enum(['active', 'suspended']).optional() })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'role or status is required')
  .meta({ id: 'AdminUserUpdate' });

export const AdminCreateUser = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(80),
    role: Role,
    password: Password,
  })
  .meta({ id: 'AdminCreateUser' });

/** Claims carried by every access token. */
export const AccessClaims = z.object({
  sub: Id,
  role: Role,
  name: z.string(),
});
export type AccessClaims = z.infer<typeof AccessClaims>;

export type Tokens = z.infer<typeof Tokens>;
export type Session = z.infer<typeof Session>;
export type RegisterRequest = z.infer<typeof RegisterRequest>;
export type RegisterResponse = z.infer<typeof RegisterResponse>;

// Types for every schema above.
export type UserStatus = z.infer<typeof UserStatus>;
export type LoginRequest = z.infer<typeof LoginRequest>;
export type RefreshRequest = z.infer<typeof RefreshRequest>;
export type TokenRequest = z.infer<typeof TokenRequest>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequest>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;
export type AdminUserQuery = z.infer<typeof AdminUserQuery>;
export type UserPage = z.infer<typeof UserPage>;
export type AdminUserUpdate = z.infer<typeof AdminUserUpdate>;
export type AdminCreateUser = z.infer<typeof AdminCreateUser>;
