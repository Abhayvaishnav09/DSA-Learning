# Architecture Decision Records

Each significant, hard-to-reverse decision gets a short record: context, decision, alternatives, consequences. Copy [the template](0000-template.md) to add one. Status starts as **Proposed**; it becomes **Accepted** once the team (or you) signs off, and is never edited after that, only superseded by a new ADR.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-typescript-monorepo.md) | TypeScript end to end in a pnpm + Turborepo monorepo | Proposed |
| [0002](0002-modular-monolith.md) | Modular monolith with an outbox, not microservices | Proposed |
| [0003](0003-aws-ecs-terraform.md) | AWS (Mumbai) with ECS Fargate and Terraform | Proposed |
| [0004](0004-sandboxed-judge.md) | Two-layer code execution: browser workers + gVisor judge | Proposed |
| [0005](0005-bkt-and-fsrs.md) | Bayesian Knowledge Tracing for mastery, FSRS for reviews | Proposed |
| [0006](0006-passwordless-auth.md) | Passwordless auth: email OTP + Google OIDC, sessions owned by us | Proposed |
| [0007](0007-free-core-entitlements.md) | Free core, entitlements module from day one | Proposed |
| [0008](0008-claude-for-ai-features.md) | Claude API for AI features, behind an ai-gateway module | Proposed |
| [0009](0009-languages-js-python.md) | Teach in JavaScript and Python, pseudocode first | Proposed |
| [0010](0010-bilingual-content.md) | English and Hinglish as first-class locales | Proposed |
