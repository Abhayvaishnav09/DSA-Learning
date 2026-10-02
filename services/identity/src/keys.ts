import { randomUUID } from 'node:crypto';
import type { Db } from '@logicpath/service-kit';
import { desc, isNull } from 'drizzle-orm';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import { signingKeys } from './schema';

export interface KeyRing {
  kid: string;
  privateKey: CryptoKey;
  jwks: { keys: JWK[] };
  verifyKeys: JWTVerifyGetKey;
}

/**
 * Ed25519 signing keys. The newest non-retired key signs; all non-retired keys verify, so a
 * rotation never logs anyone out. Production loads SIGNING_KEY_JWK from a secret manager instead
 * of keeping the private key in the database.
 */
export async function loadKeyRing(db: Db, provided?: string): Promise<KeyRing> {
  if (provided) {
    const jwk = JSON.parse(provided) as JWK;
    const kid = jwk.kid ?? 'provided';
    const { d: _private, ...publicJwk } = jwk;
    return build(kid, jwk, [{ ...publicJwk, kid }]);
  }
  let rows = await db
    .select()
    .from(signingKeys)
    .where(isNull(signingKeys.retiredAt))
    .orderBy(desc(signingKeys.createdAt));
  if (rows.length === 0) {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { extractable: true });
    const kid = randomUUID();
    await db
      .insert(signingKeys)
      .values({
        kid,
        privateJwk: await exportJWK(privateKey),
        publicJwk: { ...(await exportJWK(publicKey)), kid },
      })
      .onConflictDoNothing();
    rows = await db
      .select()
      .from(signingKeys)
      .where(isNull(signingKeys.retiredAt))
      .orderBy(desc(signingKeys.createdAt));
  }
  const newest = rows[0]!;
  return build(
    newest.kid,
    newest.privateJwk as JWK,
    rows.map((r) => ({ ...(r.publicJwk as JWK), kid: r.kid, alg: 'EdDSA', use: 'sig' })),
  );
}

async function build(kid: string, privateJwk: JWK, publicJwks: JWK[]): Promise<KeyRing> {
  const privateKey = (await importJWK(privateJwk, 'EdDSA')) as CryptoKey;
  const jwks = { keys: publicJwks.map((k) => ({ ...k, alg: 'EdDSA', use: 'sig' })) };
  return { kid, privateKey, jwks, verifyKeys: createLocalJWKSet(jwks) };
}

export const ACCESS_TOKEN_SECONDS = 15 * 60;

export function signAccessToken(
  ring: KeyRing,
  user: { id: string; role: string; name: string },
  issuer: string,
  audience: string,
): Promise<string> {
  return new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'EdDSA', kid: ring.kid, typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(ring.privateKey);
}
