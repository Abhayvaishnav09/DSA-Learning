# ADR-0002: Modular monolith with an outbox, not microservices

- **Status:** Proposed
- **Date:** 2026-10-01

## Context
We need clear boundaries (identity, practice, learning, review, ...) but have a small team and low initial traffic.

## Decision
One `api` deployable with NestJS modules. Each module owns its Postgres schema and exposes only `index.ts`. Cross-module side effects go through a transactional outbox and idempotent consumers. The judge is separate from day one because of its security boundary.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Microservices from day one | Independent scaling | Distributed transactions, many pipelines, high ops load |
| Unstructured monolith | Fastest start | Becomes a big ball of mud; hard to split later |

## Consequences
Lint rules and reviews must enforce boundaries. Splitting a module later is mostly moving code and replacing in-process calls with HTTP/queue calls.

## Revisit when
A module needs a different scaling profile, runtime or security boundary, or a separate team owns it.
