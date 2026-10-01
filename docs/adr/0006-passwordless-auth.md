# ADR-0006: Passwordless auth: email OTP + Google OIDC, sessions owned by us

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Beginners forget passwords; password storage is a liability.

## Decision
Email one-time codes and Google sign-in. The `identity` module issues its own sessions (httpOnly cookies). Implemented with a well-maintained auth library rather than hand-rolled crypto.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Hosted auth (Clerk/Auth0/Cognito) | Fast | Per-user cost at scale, vendor lock-in for a core table |
| Passwords | Familiar | Resets, breaches, support load |

## Consequences
We own OTP rate limiting and email deliverability (SES with SPF/DKIM/DMARC).

## Revisit when
We need enterprise SSO (schools/colleges) — add SAML/OIDC per institution.
