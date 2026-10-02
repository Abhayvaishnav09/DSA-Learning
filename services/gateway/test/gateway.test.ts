import { loadConfig, startService, type RunningService } from '@logicpath/service-kit';
import { baseTestEnv, createTestDatabase, testPrefix } from '@logicpath/service-kit/testing';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env as identityEnv, identityService } from '../../identity/src/service';
import { env as profileEnv, profileService } from '../../profile/src/service';
import { createGateway, env } from '../src/gateway';

// Full chain through the gateway against real identity + profile services, Postgres and NATS.
let gateway: FastifyInstance;
const services: RunningService<never>[] = [];
const drops: (() => Promise<void>)[] = [];

beforeAll(async () => {
  const prefix = testPrefix();
  const idDb = await createTestDatabase('gw_identity');
  const profileDb = await createTestDatabase('gw_profile');
  drops.push(idDb.drop, profileDb.drop);
  const identity = await startService(
    identityService(
      loadConfig(
        identityEnv,
        baseTestEnv('identity', idDb.url, prefix, { COOKIE_SECURE: 'false' }),
      ),
    ),
  );
  const profile = await startService(
    profileService(
      loadConfig(
        profileEnv,
        baseTestEnv('profile', profileDb.url, prefix, {
          JWKS_URL: `${identity.url}/.well-known/jwks.json`,
        }),
      ),
    ),
  );
  services.push(identity as never, profile as never);
  gateway = await createGateway(
    loadConfig(env, {
      SERVICE_NAME: 'gateway',
      LOG_LEVEL: 'silent',
      IDENTITY_URL: identity.url,
      PROFILE_URL: profile.url,
      SENSITIVE_LIMIT_PER_MINUTE: '5',
    }),
  );
});

afterAll(async () => {
  await gateway?.close();
  for (const s of services) await s.stop();
  for (const d of drops) await d();
});

const call = async (
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) => {
  const res = await gateway.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers,
  });
  return {
    status: res.statusCode,
    body: res.body ? (res.json() as Record<string, any>) : {},
    headers: res.headers,
  };
};

describe('gateway', () => {
  it('routes auth and profile calls to their services', async () => {
    const reg = await call('POST', '/v1/auth/register', {
      email: 'gw@example.com',
      password: 'password-123',
      name: 'Gita',
      birthYear: 1995,
    });
    expect(reg.status).toBe(201);
    expect(reg.headers['x-request-id']).toBeTruthy();
    const auth = { authorization: `Bearer ${reg.body.tokens.accessToken}` };
    const profile = await call('GET', '/v1/me/profile', undefined, auth);
    expect(profile.status).toBe(200);
    expect(profile.body.displayName).toBe('Gita');
    const jwks = await call('GET', '/.well-known/jwks.json');
    expect(jwks.body.keys[0]).toMatchObject({ alg: 'EdDSA', kty: 'OKP' });
  });

  it('rejects forged tokens at the edge with a problem response', async () => {
    const res = await call('GET', '/v1/me/profile', undefined, {
      authorization: 'Bearer eyJhbGciOiJFZERTQSJ9.e30.bad',
    });
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('rate-limits sensitive endpoints', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push(
        (
          await call('POST', '/v1/auth/login', {
            email: 'x@example.com',
            password: 'wrong-password',
          })
        ).status,
      );
    }
    // The limit is 5 per minute per client; the sign-up in the first test already used one.
    expect(statuses.filter((s) => s === 401)).toHaveLength(4);
    expect(statuses.slice(4)).toEqual([429, 429, 429]);
  });

  it('answers 503-style problems when a service is down', async () => {
    const res = await call('GET', '/v1/rewards/me');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
