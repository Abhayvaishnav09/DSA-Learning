# 02. Architecture

## 1. Drivers

| Driver | Consequence |
|---|---|
| Instant feedback (< 100 ms non-code, < 1 s code) | Grade in the browser; server confirms asynchronously |
| Mostly mobile, often weak networks (India) | Edge CDN, small bundles, offline-capable PWA |
| Small team at first | Modular monolith, one language (TypeScript) end to end, managed services |
| Content changes daily | Content-as-code, released independently of app code |
| Untrusted learner code | Isolated execution, never in the API process |
| AI later | An AI gateway module with its own budget, guardrails and evals, behind an interface from day one |
| Growth to 1M+ learners | Stateless API, partitioned event tables, read replicas, a clear split path |

## 2. System context (C4 level 1)

```
                         ┌──────────────────────────┐
   Learner (browser) ───►│                          │◄─── Author (content PRs via GitHub)
   Admin (browser)  ────►│        LogicPath         │
                         │                          │───► Email provider (transactional)
                         └──────┬─────────┬─────────┘───► OIDC providers (Google, email OTP)
                                │         │
                                ▼         ▼
                       Claude API      Product analytics / error tracking
                       (R3, AI tutor)
```

## 3. Containers (C4 level 2)

```
                    ┌──────────────────────── CDN / Edge (WAF, cache, bot protection) ───────────────────────┐
                    │                                                                                         │
             ┌──────▼───────┐        ┌───────────────────┐                                                  │
             │  web (Next.js)│──────►│ Static content    │  versioned content bundles (JSON), media          │
             │  SSR + RSC    │       │ bundles (object   │                                                  │
             │  + PWA        │       │ storage)          │                                                  │
             └──────┬────────┘       └───────────────────┘                                                  │
                    │ REST/JSON (OpenAPI), SSE                                                               │
             ┌──────▼──────────────────────────────────────────────┐        ┌──────────────────────┐        │
             │                  api (modular monolith)              │──────►│  judge (code runner) │        │
             │ identity · learning · practice · review · progress   │ queue  │  isolated sandboxes  │        │
             │ content · entitlements · notification · ai-gateway   │◄──────│  (gVisor / Firecracker)│      │
             │ admin                                                │ result └──────────────────────┘        │
             └──┬───────────┬──────────────┬───────────────┬────────┘                                       │
                │           │              │               │                                                │
         ┌──────▼───┐ ┌─────▼────┐  ┌──────▼──────┐ ┌──────▼────────┐                                      │
         │PostgreSQL│ │  Redis   │  │ worker      │ │ Event stream  │──► analytics warehouse (ClickHouse)  │
         │ primary  │ │cache,    │  │ (BullMQ jobs│ │ (outbox →     │                                      │
         │ + replica│ │rate limit│  │ cron, email)│ │  queue)       │                                      │
         └──────────┘ └──────────┘  └─────────────┘ └───────────────┘                                      │
                    └─────────────────────────────────────────────────────────────────────────────────────┘
```

| Container | Tech | Scales by | State |
|---|---|---|---|
| `web` | Next.js (App Router, React Server Components), TypeScript | Edge/serverless or containers, horizontal | None |
| `api` | Node.js, NestJS, TypeScript | Containers, horizontal, behind load balancer | None (tokens) |
| `worker` | Same codebase as `api`, different entrypoint | Queue depth | None |
| `judge` | Go or Rust supervisor + sandboxed runtimes | Queue depth, separate node pool | None |
| PostgreSQL | Managed (e.g. AWS RDS / Aurora) | Vertical, read replicas, partitioning | Source of truth |
| Redis | Managed | Vertical, then cluster | Cache, rate limits, queues (rebuildable) |
| Object storage + CDN | S3 + CloudFront (or Cloudflare R2 + CDN) | Unlimited | Content bundles, media |
| Analytics | ClickHouse (managed) | Columnar, append-only | Events (derived) |

## 4. Why a modular monolith

One deployable `api` with strict internal modules. Each module owns its tables; other modules call its public service interface or react to its events. A module **never** reads another module's tables. Lint rules enforce this (`eslint-plugin-boundaries` plus a dependency-cruiser config in CI).

This gives:
- Microservice-style boundaries without network calls, distributed transactions or 10 deploy pipelines.
- A mechanical split later. Candidates in order: `judge` (already separate), `ai-gateway`, `notification`, `analytics-ingest`.

Split a module out **only** when one of these is true: it needs a different scaling profile, a different runtime, a different security boundary, or a separate team owns it. See [ADR-0002](adr/0002-modular-monolith.md).

## 5. Modules (bounded contexts)

| Module | Owns | Publishes events | Consumes |
|---|---|---|---|
| `identity` | users, sessions, OAuth links, roles | `UserRegistered`, `UserDeleted` | — |
| `content` | published content versions, concept graph, item index | `ContentVersionPublished` | — |
| `practice` | attempts, grading, hint usage | `AttemptRecorded`, `HintUsed` | `JudgeResult` |
| `learning` | mastery per concept, unlock state | `ConceptMastered`, `ConceptUnlocked` | `AttemptRecorded` |
| `review` | FSRS cards, due queue | `ReviewScheduled` | `AttemptRecorded` |
| `progress` | streaks, daily goals, achievements, the map view | `StreakUpdated` | `AttemptRecorded`, `ConceptMastered` |
| `entitlements` | plans, quotas, feature access | `EntitlementChanged` | `UserRegistered` |
| `notification` | email, web push, in-app notices, preferences | — | many |
| `ai-gateway` (R3) | prompts, model calls, budgets, AI logs | `AiInteractionCompleted` | — |
| `experiments` | flags, assignments, exposures | `ExperimentExposure` | — |
| `admin` | admin views, audits, moderation | — | — |

## 6. Key flows

### 6.1 Answer a non-code item (the hot path)

```
Browser                         api                          Postgres / Outbox / Worker
  │ grade locally (shared grader)│
  │ show feedback  (≤100 ms)     │
  │── POST /attempts ───────────►│ idempotency-key = client UUID
  │                              │ re-grade with same shared grader (trust server)
  │                              │ tx: insert attempt + outbox(AttemptRecorded)
  │◄── 201 {serverVerdict} ──────│
  │                              │            outbox relay ──► queue
  │                              │            learning: update BKT mastery
  │                              │            review:   schedule FSRS card
  │                              │            progress: streak/goal
  │◄── SSE: mastery/unlock ──────│ (pushed when consumers finish, usually < 300 ms)
```

- The grader is a **shared TypeScript package** used by browser and server, so verdicts can't drift.
- If the server verdict differs (tampering or a bug), the server wins and the client reconciles.
- Offline: attempts queue in IndexedDB and replay in order with their idempotency keys.

### 6.2 Code item

```
Browser: run tests in a Web Worker (JS natively, Python via Pyodide) ─► instant result
      └─ POST /attempts {code, clientResult}
api: enqueue JudgeJob ─► judge runs hidden tests in a sandbox ─► JudgeResult event
api: practice records the verdict ─► same downstream as 6.1 ─► SSE to browser
```

Visible tests run in the browser. **Hidden tests** run only on the judge, so the learner can't overfit to them. See [07-code-execution](07-code-execution.md).

### 6.3 Content release

```
Author PR ─► CI validates (schema, graph acyclic, items solvable, i18n complete, a11y)
          ─► merge ─► build content bundle (hashed, immutable) ─► upload to object storage
          ─► api: POST /internal/content/versions (activate) ─► ContentVersionPublished
          ─► web: fetches new manifest; old bundle stays for in-flight sessions
```

Content and code release independently. Rolling back content means activating the previous version: one API call, no deploy.

## 7. Cross-cutting concerns

| Concern | Approach |
|---|---|
| API contract | OpenAPI 3.1 generated from Zod schemas in `packages/contracts`; typed client generated for web |
| Consistency | Strong within a module (one Postgres transaction). Eventual across modules via the transactional outbox |
| Idempotency | Every mutating request takes `Idempotency-Key`; stored for 24 h |
| Real-time | Server-Sent Events for learner updates (simpler than WebSockets, works through proxies) |
| Time | All timestamps UTC; "day" for streaks uses the learner's IANA time zone |
| i18n | ICU message format; content has per-locale fields; fallback to English |
| Config | 12-factor env vars, validated at boot with Zod; secrets from a secrets manager |
| Observability | OpenTelemetry traces/metrics/logs from every container, one trace id from browser to judge |

## 8. Scaling path

| Stage | Learners (DAU) | Changes |
|---|---|---|
| A | < 10k | 2 api tasks, 1 worker, 1 judge, single Postgres + replica |
| B | 10k to 100k | Autoscale api/worker/judge; Redis for hot reads (concept graph, user progress summary); partition `attempts` monthly |
| C | 100k to 1M | Read replicas for map/progress queries; move outbox relay to a managed stream (Kafka/Redpanda or Kinesis); split `judge` and `ai-gateway` node pools; multi-AZ everywhere |
| D | > 1M | Split hottest modules (`practice` + `review`) into services; consider regional deployments; CQRS read models for dashboards |

Back-of-envelope for stage C: 1M DAU × 40 attempts/day = 40M attempts/day ≈ 460/s average, about 2,000/s peak. Each attempt is one indexed insert plus an outbox row. Partitioned Postgres on a large instance handles this. Analytics moves to ClickHouse so Postgres only serves OLTP.

## 9. Repository layout (monorepo)

```
logicpath/
├─ apps/
│  ├─ web/                 Next.js app
│  ├─ api/                 NestJS modular monolith (api + worker entrypoints)
│  ├─ judge/               sandbox supervisor
│  └─ admin/               (later, can live inside web under /admin first)
├─ packages/
│  ├─ contracts/           Zod schemas → OpenAPI + typed client
│  ├─ grader/              shared item grading (browser + server)
│  ├─ learning-engine/     BKT + FSRS (browser + server)
│  ├─ visualizer/          step-engine + renderers
│  ├─ content-schema/      content types, validators, CLI
│  ├─ ui/                  design system (tokens, components, Storybook)
│  ├─ config/              eslint, tsconfig, prettier presets
│  └─ observability/       OTel setup shared by apps
├─ content/                lessons, items, concept graph (see 06)
├─ infra/                  Terraform, Helm/ECS task defs, dashboards-as-code
├─ docs/                   these docs + ADRs
└─ .github/                workflows, CODEOWNERS, templates
```

Tooling: **pnpm** workspaces + **Turborepo** (remote cache) for task orchestration. See [ADR-0001](adr/0001-typescript-monorepo.md).
