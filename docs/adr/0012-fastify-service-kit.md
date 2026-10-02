# ADR-0012: Fastify + Zod services built on a shared service kit

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
Twelve services must look and behave the same: config, logs, errors, auth, OpenAPI, health, metrics, outbox, consumers.

## Decision
Fastify 5 with fastify-type-provider-zod; request/response schemas come from `packages/contracts` (Zod), so validation, TypeScript types and OpenAPI 3.1 come from one source. `packages/service-kit` provides `startService()` with all cross-cutting concerns. Services are bundled with esbuild into one file each.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| NestJS | Popular, DI, modules | Decorator metadata needs tsc; our esbuild/vitest toolchain does not emit it; heavier per service |
| Hono | Tiny, edge-ready | Smaller plugin ecosystem for proxying, rate limits, swagger |

## Consequences
Services stay small (a schema, routes, consumers). The kit is a shared library, so changes to it are released carefully and tested by every service's integration tests.
