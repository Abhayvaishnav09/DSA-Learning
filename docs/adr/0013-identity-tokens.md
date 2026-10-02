# ADR-0013: Own identity service: EdDSA JWT access tokens, rotating refresh tokens, JWKS

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
Web and Flutter must use the same auth API. Other services must verify users without calling identity on every request.

## Decision
- Access tokens: EdDSA (Ed25519) JWTs, 15 minutes, claims `sub`, `role`, `name`; public keys at `/.well-known/jwks.json`, cached by every service and the gateway.
- Refresh tokens: opaque, single use, rotated on every refresh; reusing a rotated token revokes the whole token family (theft detection). Web clients get them in an httpOnly, SameSite=Strict cookie; mobile clients in the response body for secure storage.
- Passwords: argon2id; lockout after 10 failures; generic error messages.
- Roles: student < writer < admin.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Keycloak | Complete, standard | Heavy JVM server, own UI and theming work |
| Ory (Kratos/Hydra/Keto) | Headless, flexible | Four services plus a custom UI |
| Better Auth | Fast to adopt | Cookie-centric; its endpoint shapes become our public API |

## Consequences
We own security-critical code, so it has the strictest tests (rotation, reuse, lockout, role matrix). Google sign-in and OIDC can be added to the same service later.
