import { timingSafeEqual } from 'node:crypto';
import { identity, type Role } from '@logicpath/contracts';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, importJWK, jwtVerify, type JWK, type JWTVerifyGetKey } from 'jose';
import type { BaseConfig } from './config';
import { forbidden, unauthorized } from './errors';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export type VerifyToken = (token: string) => Promise<AuthUser>;

type KeyInput = Parameters<typeof jwtVerify>[1];

/** Builds the access-token verifier: remote JWKS (cached by jose) or a static public key. */
export function createVerifier(
  config: Pick<BaseConfig, 'JWKS_URL' | 'JWT_PUBLIC_JWK' | 'JWT_ISSUER' | 'JWT_AUDIENCE'>,
  keys?: JWTVerifyGetKey,
): VerifyToken {
  let resolved: Promise<KeyInput> | null = null;
  const key = (): Promise<KeyInput> => {
    resolved ??= (async (): Promise<KeyInput> => {
      if (keys) return keys;
      if (config.JWT_PUBLIC_JWK)
        return (await importJWK(JSON.parse(config.JWT_PUBLIC_JWK) as JWK, 'EdDSA')) as KeyInput;
      if (config.JWKS_URL)
        return createRemoteJWKSet(new URL(config.JWKS_URL), { cacheMaxAge: 10 * 60_000 });
      throw new Error('no JWKS_URL or JWT_PUBLIC_JWK configured');
    })();
    return resolved;
  };

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, (await key()) as never, {
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
        algorithms: ['EdDSA'],
      });
      const claims = identity.AccessClaims.parse(payload);
      return { id: claims.sub, role: claims.role, name: claims.name };
    } catch {
      throw unauthorized('Your session is invalid or has expired');
    }
  };
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

/** Role check: admin can do everything a writer can; writer everything a student can. */
const RANK: Record<Role, number> = { student: 1, writer: 2, admin: 3 };

export function requireRole(request: FastifyRequest, minimum: Role): AuthUser {
  const user = requireUser(request);
  if (RANK[user.role] < RANK[minimum]) throw forbidden();
  return user;
}

export function requireInternal(
  request: FastifyRequest,
  config: Pick<BaseConfig, 'INTERNAL_TOKEN'>,
): void {
  const given = Buffer.from(String(request.headers['x-internal-token'] ?? ''));
  const expected = Buffer.from(config.INTERNAL_TOKEN);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw forbidden('internal endpoint');
}
