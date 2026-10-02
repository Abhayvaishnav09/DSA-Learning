# ADR-0011: Microservices with database per service (supersedes ADR-0002)

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
The owner wants a backend that web and Android share, that can be handed to other developers, and that is built as independent services. ADR-0002 chose a modular monolith for a small team.

## Decision
Split the backend into 12 services by bounded context (identity, profile, consent, content, authoring, practice, progress, review, gamification, notification, analytics, audit) behind one gateway. Each service:
- owns its PostgreSQL database and login; no service reads another's tables;
- is built, versioned, deployed and scaled on its own (own Dockerfile target, migrations, health checks);
- talks to others through events (NATS JetStream) and, rarely, internal HTTP (claim-check fetches, privacy export).

Multi-service flows are choreographed sagas: publish (authoring → content), minor sign-up (identity → consent → notification → identity), account deletion (consent → all → consent).

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Keep the modular monolith | Least operations | Not what the owner asked for; one deploy for everything |
| Fewer, larger services (4–5) | Less infrastructure | Mixes concerns the owner wants separate (privacy, audit, gamification) |

## Consequences
More moving parts: we pay for it with a shared service kit, generated compose and Kubernetes manifests, one stack runner, and contract tests. Eventual consistency is visible in a few places (e.g. XP appears a moment after an answer).

## Revisit when
Operating cost or latency hurts; merging two services that always change together is cheap because boundaries are explicit.
