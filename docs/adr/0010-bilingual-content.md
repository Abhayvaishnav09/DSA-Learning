# ADR-0010: English and Hinglish as first-class locales

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
Many target learners think in Hindi/Hinglish; jargon-heavy English is a barrier.

## Decision
Every learner-facing string (UI and content) exists in `en` and `hi-Latn` (Hinglish in Latin script) from R1. Code identifiers stay English. Translations are written or reviewed by humans; AI may draft.

## Consequences
Content CI fails on missing locale strings. Roughly 30% more content effort.

## Revisit when
Adding Devanagari Hindi or other Indian languages.
