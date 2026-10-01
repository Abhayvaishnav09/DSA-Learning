# LogicPath: Design Docs

**LogicPath** (working name) is a website that teaches programming logic to people with **zero** programming knowledge and takes them all the way to interview-level DSA.

These docs are the full pre-build plan: product, learning science, architecture, frontend, backend, data, infrastructure, security, quality, AI and project management. Nothing gets built until it fits here. If the code needs to change direction, update the doc first through a PR.

## Reading order

| # | Doc | Answers | Owner |
|---|---|---|---|
| 00 | [Vision and product](00-vision-and-product.md) | Why, for whom, what success means, scope per release | Product |
| 01 | [Learning science](01-learning-science.md) | How the logic actually sinks in: lesson loop, mastery model, spaced repetition, curriculum graph | Learning design |
| 02 | [Architecture](02-architecture.md) | System shape, service boundaries, key flows, scaling path | Tech lead |
| 03 | [Frontend](03-frontend.md) | Web app: rendering, state, visualizer engine, editor, offline, design system, performance | Frontend |
| 04 | [Backend](04-backend.md) | Modules, API, events, jobs, caching, rate limits | Backend |
| 05 | [Data](05-data.md) | Schema, indexes, partitioning, analytics pipeline, retention | Backend |
| 06 | [Content system](06-content-system.md) | Content-as-code: formats, validation, authoring, release | Content + Frontend |
| 07 | [Code execution](07-code-execution.md) | Running learner code safely in the browser and on the server | Platform |
| 08 | [AI integration](08-ai-integration.md) | AI tutor, hints, feedback, guardrails, evals, cost (Phase 3) | AI |
| 09 | [Infrastructure and DevOps](09-infrastructure-devops.md) | Environments, IaC, CI/CD, observability, SLOs, DR | Platform |
| 10 | [Security and privacy](10-security-privacy.md) | Threat model, auth, OWASP controls, data protection law | Security |
| 11 | [Quality and testing](11-quality-testing.md) | Test strategy, gates, load and content QA | Everyone |
| 12 | [Project management](12-project-management.md) | Phases, milestones, workflow, Definition of Done, risks | Tech lead |
| — | [Architecture Decision Records](adr/) | Why each big choice was made | Tech lead |

## Principles (apply to every doc)

1. **Learner first.** Every feature must make a concept clearer, faster to grasp or easier to remember. Anything else waits.
2. **Small steps, instant feedback.** One idea per lesson. Feedback in under 100 ms for non-code questions and under 1 s for code.
3. **Boring core, sharp edges.** Proven tech for the core (Postgres, TypeScript, HTTP). Invest the innovation budget where learners feel it: the visualizer, the mastery model and the AI tutor.
4. **Modular monolith first, services when the numbers say so.** Clear module boundaries from day one so a split later is mechanical, not a rewrite.
5. **Everything as code.** Content, infrastructure, schemas, dashboards, alerts and feature flags all live in git and ship through review.
6. **Measure learning, not clicks.** The north-star metric is concepts mastered (proved by delayed recall), not time on site.
7. **Secure and private by default.** Learner code is untrusted. Learner data is minimal.

## Glossary

| Term | Meaning |
|---|---|
| Stage | A big chunk of the curriculum (e.g. "Repetition") |
| Concept | One idea a learner can master (e.g. "loop with a counter"). Node in the knowledge graph |
| Lesson | The teaching unit for a concept (story, visual, predict, do, explain) |
| Item | A single question. Has a type, difficulty and misconception tags |
| Attempt | One answer to one item |
| Mastery | Probability that the learner knows a concept (0 to 1) |
| Review | A spaced-repetition re-ask of an item |
| Misconception | A known wrong mental model (e.g. "loop runs one extra time"). Wrong answers map to these |
