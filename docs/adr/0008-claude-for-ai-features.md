# ADR-0008: Claude API for AI features, behind an ai-gateway module

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
R3 adds AI hints, mistake explanations, code feedback and a tutor. These need strong reasoning, structured outputs, streaming and safety handling.

## Decision
Use the Claude API via the official TypeScript SDK, default model `claude-opus-5-5` with effort tuned per feature, structured outputs for non-chat features, prompt caching, and server-side refusal fallbacks. All calls go through the `ai-gateway` module (quotas, guards, logging, evals). Grading and mastery never depend on the model.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Cheaper/smaller model per feature | Lower cost | Must be proven on evals first; separate cache namespaces |
| Self-hosted open model | Data control | GPU ops cost, weaker quality for tutoring |

## Consequences
Eval sets must exist before launch. Cost is bounded by quotas and kill switches.

## Revisit when
Eval results or cost per learner say a different model or effort setting is better.
