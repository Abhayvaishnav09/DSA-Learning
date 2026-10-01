# ADR-0007: Free core, entitlements module from day one

- **Status:** Proposed
- **Date:** 2026-10-01

## Context
Monetisation is undecided, but retrofitting access control is expensive.

## Decision
All lessons and practice are free. An `entitlements` module answers `can(feature)` and `consume(quota)`. R1 has one plan. Paid plans (AI tutor quota, interview mode, certificates) can be added later by data, not code.

## Consequences
Every gated feature calls entitlements from the start, even though everything is allowed today.

## Revisit when
Before R3 (AI costs) or R4 (interview mode).
