# ADR-0005: Bayesian Knowledge Tracing for mastery, FSRS for reviews

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
We need a defensible "knows it" signal per concept, and a review schedule that fights forgetting.

## Decision
BKT per learner per concept, with hint weighting and a delayed-recall requirement for "mastered". FSRS for scheduling review cards at 0.90 target retention. Both in `packages/learning-engine`, shared by browser and server, behind interfaces so they can be replaced.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| "3 correct in a row" | Simple | Ignores guessing, hints, forgetting |
| SM-2 (Anki classic) | Well known | Less accurate than FSRS |
| Deep knowledge tracing | Potentially more accurate | Needs lots of data; opaque |

## Consequences
Parameters start as defaults and are fitted from data later (R4).

## Revisit when
We have > 1M attempts and can compare models offline on predicting delayed recall.
