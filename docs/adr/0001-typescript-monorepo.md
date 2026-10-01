# ADR-0001: TypeScript end to end in a pnpm + Turborepo monorepo

- **Status:** Proposed
- **Date:** 2026-10-01

## Context
The grader, learning engine (BKT/FSRS), content schema and API contracts must run identically in the browser and on the server. The team is small.

## Decision
TypeScript (strict) for web, api, worker and shared packages. One monorepo with pnpm workspaces and Turborepo (remote cache). The judge supervisor may use Go or Rust; it talks to the rest only through queue messages defined in `packages/contracts`.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Python/Django backend + React | Great for data work | Grader and learning engine written twice; drift risk |
| Polyrepo | Independent versioning | Cross-repo changes are slow; shared code needs publishing |
| Nx instead of Turborepo | More features | More config; Turbo is enough |

## Consequences
One language for all engineers; shared code is imported, not duplicated. CI must use affected-graph builds to stay fast.

## Revisit when
CI for an average PR exceeds 10 minutes despite caching, or a separate team needs independent release cycles.
