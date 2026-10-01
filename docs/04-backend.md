# 04. Backend

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js LTS, TypeScript strict | One language with the frontend; shared packages (grader, learning engine, contracts) |
| Framework | **NestJS** on the Fastify adapter | Module system matches our bounded contexts; DI makes testing easy; Fastify for speed |
| Validation / contracts | Zod (`packages/contracts`) → OpenAPI 3.1 | One source for request/response types, docs and client generation |
| DB access | **Drizzle ORM** + SQL migrations | Type-safe, SQL-first, no hidden queries |
| Jobs / queues | **BullMQ** on Redis | Retries, delays, priorities, cron; move to a managed stream at scale |
| Cache / rate limit | Redis | Shared across instances |
| Auth | OIDC (Google) + email one-time code; sessions issued by our `identity` module | Passwordless reduces risk and support load. See [ADR-0006](adr/0006-passwordless-auth.md) |
| Observability | OpenTelemetry SDK, pino structured logs | Vendor-neutral |

## 2. Module internals (hexagonal)

Every module has the same shape:

```
modules/practice/
  domain/          entities, value objects, domain services (pure, no framework)
  application/     use cases (RecordAttempt, UseHint), ports (interfaces)
  infrastructure/  Drizzle repositories, queue adapters, HTTP controllers
  practice.module.ts
  index.ts         the ONLY public surface (service interface + event types)
```

- Domain code has no imports from NestJS, Drizzle or Redis, so it is unit-testable in milliseconds.
- Cross-module calls go through `index.ts` exports only (lint-enforced).
- Each module owns a Postgres **schema** (`practice.*`, `learning.*`, ...). DB roles per module are the end goal; in R1 a lint rule plus code review enforce it.

## 3. API design

- REST, resource-oriented, JSON, versioned by URL prefix (`/v1`). Breaking changes mean `/v2` and a deprecation window.
- **Cursor pagination** (`?cursor=&limit=`), never offset on large tables.
- Errors follow RFC 9457 (`application/problem+json`) with a stable `type` and a `traceId`.
- `Idempotency-Key` required on all POSTs that create records.
- ETags on cacheable GETs (content, map).
- Rate limits returned in `RateLimit-*` headers.

### Main endpoints (v1)

| Method | Path | Module | Notes |
|---|---|---|---|
| POST | `/v1/auth/otp/request`, `/v1/auth/otp/verify` | identity | Email one-time code |
| GET | `/v1/auth/oauth/google/callback` | identity | OIDC |
| POST | `/v1/auth/logout` | identity | |
| GET | `/v1/me` | identity | Profile, locale, time zone |
| DELETE | `/v1/me` | identity | Account deletion (async, 30-day grace) |
| GET | `/v1/me/export` | identity | Data export (privacy) |
| GET | `/v1/content/manifest` | content | Active version + bundle URLs |
| GET | `/v1/map` | learning + progress | Concepts with status and mastery |
| POST | `/v1/attempts` | practice | Records and grades an attempt |
| POST | `/v1/items/{id}/hints` | practice | Unlocks next hint level |
| GET | `/v1/reviews/due` | review | Due cards (respects daily cap) |
| GET | `/v1/progress/summary` | progress | Streak, goal, today's stats |
| POST | `/v1/sync` | practice | Batch replay of offline attempts |
| POST | `/v1/guest/merge` | identity + all | Merge guest progress into account |
| GET | `/v1/events` | gateway | SSE stream for the user |
| POST | `/v1/tutor/sessions` (R3) | ai-gateway | Starts an AI tutor session (streamed) |
| — | `/internal/*` | admin, content | Service-to-service; mTLS or signed tokens; not public |

## 4. Events and the transactional outbox

Cross-module work never uses a distributed transaction.

1. A use case writes its own rows **and** an `outbox` row in the **same** Postgres transaction.
2. The outbox relay (in `worker`) reads unpublished rows (`FOR UPDATE SKIP LOCKED`), publishes them to the queue, and marks them sent.
3. Consumers are **idempotent** (dedupe on `event_id`) because delivery is at-least-once.

Event envelope:

```json
{
  "eventId": "01J...ULID",
  "type": "practice.AttemptRecorded",
  "version": 1,
  "occurredAt": "2026-10-01T10:00:00Z",
  "userId": "usr_...",
  "traceparent": "00-...",
  "payload": { "attemptId": "...", "itemId": "...", "conceptId": "...", "correct": true, "hintLevel": 0, "durationMs": 8400 }
}
```

Event schemas live in `packages/contracts/events` and are versioned; consumers must accept version *n* and *n-1*.

## 5. Background jobs

| Job | Trigger | Notes |
|---|---|---|
| Outbox relay | Continuous (every 200 ms) | Batches of 500 |
| Mastery update | `AttemptRecorded` | BKT; emits `ConceptMastered/Unlocked` |
| Review scheduling | `AttemptRecorded` | FSRS |
| Streak roll-over | Hourly, per time zone bucket | Learner's local midnight |
| Daily reminder | Per user preferred time | Web push / email; opt-in, quiet hours |
| Account deletion | 30 days after request | Hard delete + anonymise analytics |
| Analytics export | Continuous | Events → ClickHouse |
| Item stats | Nightly | Correct rate, median time, misconception counts per item → author dashboard |
| BKT parameter fitting (R4) | Weekly | Per concept, from attempt data |

All jobs: retries with exponential backoff and jitter, dead-letter queue, alert on DLQ growth.

## 6. Caching

| Data | Where | Invalidation |
|---|---|---|
| Content bundles | CDN, immutable (hashed URL) | New version = new URL |
| Content manifest | CDN 60 s + ETag | On publish |
| Concept graph (server use) | In-process LRU + Redis | `ContentVersionPublished` |
| Map / progress summary | Redis, per user, 5 min | Events that change mastery/streak |
| Sessions | Redis + Postgres | Logout / expiry |

Rule: cache only derived data. Postgres stays the source of truth; Redis can be flushed with no data loss.

## 7. Rate limiting and abuse

| Scope | Limit (start) |
|---|---|
| OTP request | 5 per email per hour, 20 per IP per hour, CAPTCHA after 3 |
| Attempts | 120 per user per minute |
| Code judge | 20 per user per minute, 500 per day |
| AI tutor (R3) | Per entitlement quota (tokens/day) + 10 messages per minute |
| Anonymous | Per IP + device fingerprint at the edge (WAF) |

Token bucket in Redis (sliding window); the edge WAF handles volumetric abuse before it reaches the api.

## 8. Feature flags and experiments

- **OpenFeature** SDK in api and web, backed by a flag service (self-hosted GrowthBook or Unleash).
- Flags for: release toggles (dark launch), ops kill switches (e.g. turn off Python, turn off AI), experiments.
- Experiment assignment is sticky per user and logged as `ExperimentExposure` for analysis in ClickHouse.
- Flags have an owner and an expiry date; CI warns on expired flags.

## 9. Entitlements

Every gated feature asks `entitlements.can(userId, feature)` and `entitlements.consume(userId, quota, n)`. R1 has one plan (`free`) with generous quotas. Paid plans later only change data, not code.

## 10. Configuration and secrets

- Config from env vars, validated at boot with a Zod schema; the app refuses to start on invalid config.
- Secrets from AWS Secrets Manager (or equivalent), injected at runtime, never in images or git.
- Different keys per environment; rotation runbook in [10-security-privacy](10-security-privacy.md).

## 11. Error handling and resilience

- Timeouts on every outbound call (DB 2 s, Redis 200 ms, judge 10 s, AI 60 s with streaming).
- Circuit breakers on judge and AI; degrade gracefully (show "server check pending" instead of failing).
- Health endpoints: `/healthz` (process alive), `/readyz` (DB + Redis reachable).
- Graceful shutdown: stop accepting, drain in-flight requests and jobs, then exit (30 s).
