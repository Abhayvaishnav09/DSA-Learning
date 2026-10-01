# 10. Security and Privacy

## 1. Assets and threats (STRIDE summary)

| Asset | Threat | Control |
|---|---|---|
| Learner accounts | Spoofing (account takeover) | Passwordless OTP with rate limits + CAPTCHA, OIDC, session binding, new-device email |
| Sessions | Tampering / theft | httpOnly Secure SameSite cookies, short-lived (7 d sliding, 30 d max), rotation on privilege change, revocation list |
| Progress / mastery | Tampering (fake progress) | Server re-grades everything; client results are hints only |
| Hidden tests, answer keys | Information disclosure | Never sent to clients; judge resolves tests server-side |
| Infrastructure | Elevation via learner code | Sandboxed judge in isolated account, no network, no credentials (see 07) |
| Platform | Denial of service | Edge WAF, rate limits, autoscaling, judge queue limits |
| Admin actions | Repudiation | Append-only audit log for every admin/author action |
| AI tutor | Prompt injection, data leakage | See [08-ai-integration](08-ai-integration.md#5-safety-and-privacy) |

A full threat model is reviewed before each release and when a new external integration is added.

## 2. Application security controls (OWASP ASVS L2 as the bar)

- **AuthN:** OTP codes 6 digits, 10 min expiry, 5 tries max, hashed at rest. OIDC with PKCE and `state`/`nonce`.
- **AuthZ:** deny by default; role checks (`learner`, `author`, `admin`) in a guard; every query scoped by `user_id` from the session, never from the request body. Tests for broken object-level authorisation on every endpoint.
- **Input:** Zod validation at every boundary; size limits on bodies (code ≤ 64 KB).
- **Output:** React escaping; sanitised Markdown; strict CSP; `X-Content-Type-Options`, `Referrer-Policy`, HSTS preload.
- **CSRF:** SameSite cookies + CSRF token on state-changing requests from forms.
- **SSRF:** no user-controlled outbound URLs. The judge has no network at all.
- **Secrets:** Secrets Manager, rotated; secret scanning in CI and push protection on GitHub.
- **Dependencies:** lockfile, Renovate for updates, `pnpm audit` + Socket/Snyk for supply-chain risk, pinned GitHub Actions by SHA.
- **Builds:** signed images (cosign), SBOM per build, provenance (SLSA level 2+).

## 3. Admin and internal access

- SSO + hardware-key MFA for all staff accounts (GitHub, AWS, dashboards).
- Least-privilege IAM; production access through short-lived roles with approval; break-glass procedure logged.
- No direct prod DB access for day-to-day; read-only analytics in ClickHouse instead.

## 4. Privacy

Laws in scope: India's **Digital Personal Data Protection Act, 2023 (DPDP)**, and **GDPR** for EU users.

| Principle | Implementation |
|---|---|
| Data minimisation | Collect email, display name, locale, time zone, learning data. Nothing else. No phone, no address, no birth date |
| Purpose limitation | Learning data is used for teaching and product improvement only. No selling, no ad tracking |
| Consent | Clear consent at signup; separate opt-in for marketing email and AI features |
| Children | Terms require 13+; if minors are targeted later (schools), add verifiable parental consent per DPDP |
| Access and portability | `GET /v1/me/export` (JSON) |
| Erasure | `DELETE /v1/me`, hard delete after 30 days; analytics unlinked |
| Processors | DPAs with every vendor (cloud, email, error tracking, AI provider); sub-processor list published |
| Breach | Notify affected users and the Data Protection Board / authorities within legal timelines; runbook prepared |
| Cookies | Essential cookies only by default; analytics is first-party and pseudonymous |

## 5. Security process

- Security review checklist on PRs touching auth, judge, AI or data export (CODEOWNERS routes them to security reviewers).
- Third-party penetration test before public launch (R1) and before the judge goes live (R2).
- Responsible disclosure policy + `security.txt`.
- Quarterly access review; yearly key rotation drills.
