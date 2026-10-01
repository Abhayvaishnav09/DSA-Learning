# 11. Quality and Testing

## 1. Test pyramid

| Layer | Tool | Scope | Speed | Target |
|---|---|---|---|---|
| Unit | Vitest | Domain logic, grader, BKT, FSRS, visualizer frames, reducers | ms | 90% branch coverage on `packages/grader`, `learning-engine`; 80% on domain code |
| Property-based | fast-check | Grader (equivalent answers grade the same), FSRS (intervals monotonic), BKT (bounded 0..1) | ms | All core algorithms |
| Component | Testing Library + Vitest | Item renderers, lesson beats, a11y via jest-axe | ms | Every component state |
| Visual regression | Storybook + Chromatic/Playwright screenshots | Design system, visualizer renderers | s | All stories, light/dark |
| Integration | Testcontainers (real Postgres, Redis) | Repositories, use cases, outbox, consumers | s | Every module |
| Contract | OpenAPI diff + schema tests | API compatibility, event versions | s | Every PR |
| End-to-end | Playwright (Chromium, WebKit, mobile viewport) | Critical journeys | min | 15 to 25 journeys |
| Load | k6 | Attempt POST, map GET, judge queue | min | Before each release; 3× expected peak |
| Security | ZAP baseline, CodeQL, dependency scans | Web + API | min | Every PR (fast) / nightly (full) |
| Chaos (stage C) | Fault injection (kill worker, slow DB) | Resilience | — | Quarterly game day |

## 2. Critical journeys (E2E must-pass)

1. Guest starts, completes first lesson, signs up, progress merges.
2. Login by OTP and by Google.
3. Answer each item type correctly and wrongly; see right feedback.
4. Hint ladder and solution unlock rules.
5. Concept masters, next concept unlocks, map updates live.
6. Review queue: due items appear, answer updates schedule.
7. Offline: answer 5 items offline, reconnect, all synced exactly once.
8. Code item: run visible tests in browser, submit, judge verdict arrives.
9. Streak increments across a local-midnight boundary in a non-UTC time zone.
10. Account export and deletion.
11. Hinglish locale end to end.
12. Keyboard-only completion of a lesson.

## 3. Quality gates

A PR merges only when:
- Lint, typecheck, format, unit, integration, contract and affected E2E tests pass.
- Coverage does not drop on core packages.
- Bundle and Lighthouse budgets pass.
- No new high/critical vulnerabilities.
- At least one approving review (two for auth, judge, AI, migrations).

A release goes to prod only when:
- Staging smoke + synthetic checks green for 30 minutes.
- No open SEV1/SEV2.
- Load test (for release with backend changes) within SLOs.

## 4. Flaky tests policy

A flaky test is a bug. It gets a ticket the same day and an owner. Fix the root cause (wait for the right condition, isolate data, remove timing assumptions). Tests are never silently skipped; a test can be quarantined only with an issue link and an expiry date, and quarantine is reviewed weekly.

## 5. Content QA

Covered by the content CI in [06-content-system](06-content-system.md#3-validation-pipeline-ci-on-every-content-pr), plus:
- Every new concept is tried by 3 to 5 real beginners (moderated) before going to 100%.
- Item stats review weekly.

## 6. Test data

- Factories (not fixtures) for domain objects.
- Seed script creates personas (new learner, mid-way learner, advanced learner) for local/preview/E2E.
- Staging uses anonymised production snapshots; no real emails.
