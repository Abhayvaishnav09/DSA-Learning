import { z } from 'zod';

/** Settings every service understands. Services extend this with their own keys. */
export const BaseEnv = z.object({
  SERVICE_NAME: z.string().min(1),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().optional(),
  NATS_URL: z.string().default('nats://127.0.0.1:4222'),
  /** Subject/stream prefix; tests use a random one so runs never see each other's events. */
  EVENT_PREFIX: z
    .string()
    .regex(/^[a-z][a-z0-9]*$/)
    .default('lp'),
  /** Where to fetch identity's public keys. */
  JWKS_URL: z.string().optional(),
  /** Alternative to JWKS_URL: a public JWK as JSON (tests, offline setups). */
  JWT_PUBLIC_JWK: z.string().optional(),
  JWT_ISSUER: z.string().default('logicpath-identity'),
  JWT_AUDIENCE: z.string().default('logicpath'),
  /** Shared secret for service-to-service internal endpoints (mTLS in production). */
  INTERNAL_TOKEN: z.string().min(16).default('dev-internal-token-change-me'),
});
export type BaseConfig = z.infer<typeof BaseEnv>;

/** Validates process.env at boot; a service refuses to start with bad config. */
export function loadConfig<S extends z.ZodRawShape>(
  extra: S,
  env: Record<string, string | undefined> = process.env,
): BaseConfig & z.infer<z.ZodObject<S>> {
  const result = BaseEnv.extend(extra).safeParse(env);
  if (!result.success) {
    throw new Error(`invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data as BaseConfig & z.infer<z.ZodObject<S>>;
}
