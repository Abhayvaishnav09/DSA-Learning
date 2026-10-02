# 09. Infrastructure and DevOps

## 1. Cloud and runtime

Primary cloud: **AWS**, region `ap-south-1` (Mumbai) for low latency to most learners; DR copies in `ap-southeast-1`. See [ADR-0003](adr/0003-aws-ecs-terraform.md).

| Component | Service |
|---|---|
| Edge | CloudFront (or Cloudflare) + AWS WAF, bot control |
| web | Containers on ECS Fargate (or Vercel early on; the app is portable) |
| api, worker | ECS Fargate services, autoscaling on CPU / queue depth |
| judge | Separate ECS cluster on EC2 with gVisor, in an isolated VPC/account |
| Postgres | Aurora PostgreSQL, Multi-AZ, PITR |
| Redis | ElastiCache (Valkey/Redis), Multi-AZ |
| Object storage | S3 (+ CloudFront) |
| Secrets | Secrets Manager + KMS |
| Analytics | ClickHouse Cloud |
| Email | SES |

Kubernetes (EKS) is **not** used at the start: it adds operational load a small team doesn't need. Revisit at scaling stage C or if the judge needs finer scheduling.

## 2. Environments

| Env | Purpose | Data | Deploys |
|---|---|---|---|
| `local` | Dev on laptop | Seed data | `docker compose up` (Postgres, Redis, judge, mail catcher) |
| `preview` | One per PR | Seed data | Automatic on PR, destroyed on close |
| `staging` | Pre-prod, mirrors prod topology | Anonymised snapshot | Automatic on merge to `main` |
| `prod` | Live | Real | Promote the **same image** from staging after checks |

## 3. Infrastructure as code

- **Terraform** for all cloud resources, in `infra/terraform/` with modules per component and one state per env.
- Plans run on every infra PR and are posted as a comment; `apply` only from CI with approval.
- Policy checks (tfsec / Checkov) and cost estimate (Infracost) on PRs.
- No manual console changes; drift detection runs nightly.

## 4. CI/CD (GitHub Actions)

**Implemented:** see [cicd.md](cicd.md) for the running pipeline, secrets and one-time setup. The diagram below is the target design; contract diffing (oasdiff), Lighthouse CI and canary releases are still to come.

```
PR opened
 ├─ install (pnpm, cached) ─ turbo affected graph
 ├─ lint · typecheck · format
 ├─ unit + component tests (affected packages)
 ├─ integration tests (Testcontainers: Postgres, Redis)
 ├─ contract check (OpenAPI diff → breaking change fails)
 ├─ content check (if content/ changed)
 ├─ build images (SBOM, signed with cosign)
 ├─ security: dependency audit, secret scan, SAST (CodeQL), container scan (Trivy)
 ├─ preview deploy → e2e (Playwright) + Lighthouse CI + bundle budget
 └─ AI evals (if prompts/AI code changed, R3+)

merge to main
 ├─ build once → push image (immutable tag = git sha)
 ├─ migrate staging DB → deploy staging → smoke tests → synthetic checks
 └─ manual promote → migrate prod → canary 10% (15 min, auto-rollback on SLO burn) → 100%
```

- Trunk-based development; short-lived branches; feature flags for unfinished work.
- Deploys are boring: several per day, any engineer, any weekday before 4 pm.
- Rollback: redeploy previous image (one click); content rollback separate (see 06).

## 5. Observability

| Signal | Tool | Notes |
|---|---|---|
| Traces | OpenTelemetry → Grafana Tempo (or Honeycomb) | Browser → api → worker → judge share one trace id |
| Metrics | OTel → Prometheus-compatible (Grafana Mimir / AMP) | RED metrics per endpoint, USE per resource, queue depth, judge wait |
| Logs | pino JSON → Loki (or CloudWatch) | Structured, trace-correlated, no PII |
| Errors | Sentry (web + api) | Release tagging, source maps |
| Real user monitoring | web-vitals → analytics | LCP/INP/CLS by device class |
| Synthetic | Checkly / Playwright cron | Login, complete a lesson, run code, every 5 min |
| Dashboards & alerts | Defined as code in `infra/observability` | Reviewed like code |

### SLOs

| SLO | Target | Window |
|---|---|---|
| API availability (non-5xx on `/v1/*`) | 99.9% | 30 days |
| Attempt POST latency p95 | < 300 ms | 30 days |
| Judge verdict p95 (submit to verdict) | < 3 s | 30 days |
| Lesson page LCP p75 | < 2.0 s | 28 days |

Alerting uses **multi-window burn-rate** alerts on SLOs (page on fast burn, ticket on slow burn), not raw CPU thresholds.

## 6. Incident management

- On-call rotation (once the team is ≥ 3); PagerDuty/Opsgenie.
- Severity levels SEV1 (site down / data loss) to SEV4 (minor).
- Runbooks per alert in `docs/runbooks/` (linked from the alert).
- Blameless post-mortem within 5 working days for SEV1/SEV2, with tracked action items.
- Public status page.

## 7. Disaster recovery

| Scenario | Plan | RTO / RPO |
|---|---|---|
| AZ failure | Multi-AZ everything; automatic | Minutes / 0 |
| Bad deploy | Canary auto-rollback; manual one-click rollback | < 10 min / 0 |
| Data corruption | PITR restore to new cluster, replay outbox if needed | < 1 h / ≤ 5 min |
| Region failure | Restore from cross-region snapshots + IaC into DR region | < 4 h / ≤ 1 h |

DR game day every quarter.

## 8. Cost management

- Tags on every resource (`env`, `service`, `owner`); monthly cost review.
- Budgets and anomaly alerts per environment.
- Preview envs scale to zero; staging scales down nights and weekends.
- Unit economics tracked: infra cost per monthly active learner (target < ₹5 at stage B).
