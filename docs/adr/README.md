# Architecture Decision Records

Each significant, hard-to-reverse decision gets a short record: context, decision, alternatives, consequences. Copy [the template](0000-template.md) to add one. Status starts as **Proposed**; it becomes **Accepted** once the team (or you) signs off, and is never edited after that, only superseded by a new ADR.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-typescript-monorepo.md) | TypeScript end to end in a pnpm + Turborepo monorepo | Accepted |
| [0002](0002-modular-monolith.md) | Modular monolith with an outbox, not microservices | Superseded by 0011 |
| [0003](0003-aws-ecs-terraform.md) | AWS (Mumbai) with ECS Fargate and Terraform | Accepted |
| [0004](0004-sandboxed-judge.md) | Two-layer code execution: browser workers + gVisor judge | Accepted |
| [0005](0005-bkt-and-fsrs.md) | Bayesian Knowledge Tracing for mastery, FSRS for reviews | Accepted |
| [0006](0006-passwordless-auth.md) | Passwordless auth: email OTP + Google OIDC, sessions owned by us | Accepted |
| [0007](0007-free-core-entitlements.md) | Free core, entitlements module from day one | Accepted |
| [0008](0008-claude-for-ai-features.md) | Claude API for AI features, behind an ai-gateway module | Accepted |
| [0009](0009-languages-js-python.md) | Teach in JavaScript and Python, pseudocode first | Accepted |
| [0010](0010-bilingual-content.md) | English and Hinglish as first-class locales | Accepted |
| [0011](0011-microservices.md) | Microservices with database per service (supersedes ADR-0002) | Accepted |
| [0012](0012-fastify-service-kit.md) | Fastify + Zod services built on a shared service kit | Accepted |
| [0013](0013-identity-tokens.md) | Own identity service: EdDSA JWT access tokens, rotating refresh tokens, JWKS | Accepted |
| [0014](0014-nats-jetstream-outbox.md) | NATS JetStream for events, with outbox and idempotent consumers | Accepted |
| [0015](0015-gateway-openapi.md) | One public gateway, OpenAPI-first, generated clients | Accepted |
| [0016](0016-flutter-android.md) | Flutter for the Android app | Accepted |
| [0017](0017-roles-authoring.md) | Three roles, an authoring workflow, and the database as the content source of truth | Accepted |
| [0018](0018-dpdp-parental-consent.md) | Parental consent for learners under 18 (DPDP Rules 2025) | Accepted |
| [0019](0019-learning-record-ownership.md) | Who owns the learning record | Accepted |
