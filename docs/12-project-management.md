# 12. Project Management

## 1. Phases and milestones

Durations assume a core team of 3 to 4 engineers + 1 learning designer/content author. A solo builder should roughly double them and cut scope per release before cutting quality.

| Phase | Weeks | Milestone (exit criteria) |
|---|---|---|
| **P0. Foundations** | 1 to 3 | Monorepo, CI, design tokens, `contracts`, local docker env, preview deploys, observability skeleton, ADRs 0001 to 0008 accepted |
| **P1. Prototype (R0)** | 4 to 7 | One concept end to end in the browser: lesson player machine, visualizer engine, 4 item types, local BKT/FSRS. Tested with 5 real beginners |
| **P2. MVP backend** | 8 to 12 | identity, content, practice, learning, review, progress modules; outbox; SSE; guest merge; staging live |
| **P3. Content sprint** | 8 to 16 (parallel) | Stages 0 to 2 written (~25 concepts, ~400 items), English + Hinglish, content CI green |
| **P4. Beta (R1)** | 13 to 16 | Pen test fixed, SLO dashboards, load test passed, 200 beta learners, metrics reviewed weekly |
| **P5. Code (R2)** | 17 to 24 | Editor, JS + Python workers, tracing visualizer, judge in isolated account, Stages 3 to 4 content |
| **P6. AI (R3)** | 25 to 30 | ai-gateway, eval sets, explain-mistake + hints + code feedback, tutor chat behind flag |
| **P7. Interview (R4)** | 31 to 40 | Stages 5 to 6, mock sets, weak-topic drills, BKT fitting from data |

## 2. Work breakdown (epics for P0 to P4)

| Epic | Key stories |
|---|---|
| E1 Platform foundations | Monorepo + Turbo, lint/format/tsconfig presets, CI pipeline, Docker compose, Terraform base, preview envs, OTel + Sentry |
| E2 Design system | Tokens, themes, 15 core components, Storybook, axe in CI |
| E3 Visualizer engine | Frame model, player controls, 5 renderers, captions/a11y, reduced motion |
| E4 Lesson player | XState machine, 5 beats, resume, analytics events |
| E5 Item types | mcq, predict, arrange, fill, trace-table, truth-table, explain-why + shared grader |
| E6 Learning engine | BKT, FSRS, property tests, shared browser/server |
| E7 Identity | OTP, Google OIDC, sessions, guest mode + merge, export/delete |
| E8 Practice + learning + review | Attempts API, outbox, consumers, mastery, unlocks, due queue |
| E9 Progress and motivation | Streaks with freezes, daily goal, map, end-of-session summary |
| E10 Content pipeline | Schema, CLI, validators, build, publish/rollback, author dashboard v1 |
| E11 Offline | Service worker, IndexedDB queue, sync engine, offline reviews |
| E12 Launch readiness | Pen test, load test, SLOs/alerts, runbooks, privacy policy, status page |

Each epic gets a one-page technical spec (linked to these docs) before work starts, and is broken into stories that fit in ≤ 2 days.

## 3. Way of working

| Practice | Rule |
|---|---|
| Cadence | 2-week cycles; planning (Mon), async daily updates, demo + retro (last Fri) |
| Board | GitHub Projects: Backlog → Ready → In progress → In review → Done. WIP limit 2 per person |
| Ready (DoR) | Story has user value, acceptance criteria, design link if UI, size ≤ 2 days, dependencies clear |
| Done (DoD) | Code + tests merged, docs/ADR updated, feature-flagged if incomplete, deployed to staging, analytics events added, a11y checked, no new alerts |
| Branching | Trunk-based; branch `type/short-name`; squash merge; Conventional Commits |
| Reviews | ≤ 400 lines per PR; review within 1 working day; CODEOWNERS for sensitive areas |
| Decisions | Significant choices → ADR in `docs/adr/` (template there). Reversible choices → just decide and note in the PR |
| Docs | A change that contradicts these docs updates the doc in the same PR |
| Releases | Semantic version tags for the app; content versions separate; changelog generated from commits |

## 4. Roles (RACI)

| Area | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Product scope, metrics | Product owner | Product owner | Learning designer, tech lead | All |
| Curriculum and pedagogy | Learning designer | Product owner | Beginners (user tests) | All |
| Architecture, ADRs | Tech lead | Tech lead | All engineers | All |
| Frontend | Frontend engineer(s) | Tech lead | Designer | — |
| Backend, data | Backend engineer(s) | Tech lead | — | — |
| Infra, security, on-call | Platform engineer | Tech lead | Security reviewer | All |
| AI features (R3) | AI engineer | Tech lead | Learning designer | All |
| Content | Authors | Learning designer | Engineers (for code items) | — |

In a solo or 2-person team, one person holds several roles, but the hats stay separate: e.g. review your own ADRs a day later as "tech lead".

## 5. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Content takes longer than code | High | High | Content sprint starts in P1, CLI + preview early, AI-assisted drafting in R3 | Learning designer |
| R2 | Learners find it too slow/easy or too hard | Medium | High | Placement check, test with 5 beginners per stage, item stats loop | Product |
| R3 | Judge sandbox escape | Low | Critical | gVisor, isolated account, no network, pen test before R2 | Platform |
| R4 | Over-engineering slows the MVP | Medium | High | Modular monolith, managed services, scope cut per release, not quality cut | Tech lead |
| R5 | Low retention after week 1 | Medium | High | Streaks, reviews, daily goal, weekly cohort review | Product |
| R6 | AI cost or quality issues | Medium | Medium | Eval gates, quotas, kill switch, cache (see 08) | AI |
| R7 | Key person dependency | Medium | Medium | Docs + ADRs, pair on critical modules, runbooks | Tech lead |
| R8 | Privacy/legal non-compliance | Low | High | DPDP/GDPR checklist, DPAs, legal review before launch | Product |

Reviewed every cycle; new risks added by anyone.

## 6. Reporting

- **Weekly:** metric snapshot (activation, mastery, retention, SLOs, cost), risks changed, milestone burn-up.
- **Per cycle:** demo of working software, retro actions, roadmap adjustments.
- **Per release:** release notes, learning outcome review (did mastery/recall improve?).

## 7. Immediate next steps

1. Accept or change the defaults in [ADRs 0001 to 0010](adr/).
2. Set up the monorepo skeleton and CI (E1).
3. Build the R0 prototype for one concept, `concept:loops.counter`, and test it with 5 beginners.
