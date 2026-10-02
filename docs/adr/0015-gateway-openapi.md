# ADR-0015: One public gateway, OpenAPI-first, generated clients

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
The same API serves web and Android and is given to other developers.

## Decision
A TypeScript gateway is the only public entry: routing by path prefix, JWT check at the edge, Redis-backed rate limits (stricter on auth endpoints), CORS, request ids, security headers, and a few composed endpoints (`/v1/home`). Each service publishes OpenAPI 3.1 generated from Zod; the gateway merges them into `/v1/openapi.json`, rendered with Scalar at `/docs`, committed to `docs/api/openapi.json` and diffed in CI for breaking changes. The web app's TypeScript client and the Flutter app's Dart client are generated from that file.

## Consequences
Versioning: `/v1` is additive only; breaking changes mean `/v2` with a deprecation window. Errors are RFC 9457 problem documents everywhere.
