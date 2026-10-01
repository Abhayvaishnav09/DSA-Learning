# ADR-0009: Teach in JavaScript and Python, pseudocode first

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Absolute beginners should learn logic before syntax; interview candidates mostly use Python or JavaScript.

## Decision
Stages 0 to 2 use plain-language pseudocode and visuals, no real syntax. From Stage 3 the learner chooses JavaScript or Python (switchable anytime; items store solutions in both). Python is the suggested default for beginners because it reads more like English.

## Consequences
Every code item needs reference solutions and tests in both languages. Pyodide adds a lazy-loaded download.

## Revisit when
Strong demand for Java or C++ (common in Indian college placements) — the judge is language-agnostic, so it is mostly a content cost.
