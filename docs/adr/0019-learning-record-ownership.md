# ADR-0019: Who owns the learning record

- **Status:** Accepted
- **Date:** 2026-10-02

## Context
One answer touches grading, mastery, review scheduling, XP, leagues, class rosters, statistics and the inbox. If every service decided for itself, the numbers would drift apart.

## Decision
- **practice** grades the answer against the live curriculum, logs the attempt, and tells **progress** (`POST /internal/learners/:userId/attempts`, typed in `contracts/internal.ts`). It then emits `practice.attempt.recorded` and `practice.item.completed`.
- **progress** owns the learner's state (mastery, lesson position, streak, day totals) and applies the shared `progress-rules`.
- **review** owns the review cards, built from `practice.item.completed`.
- **gamification** owns XP and badges, built only from events (`xp[]` on the facts); **leaderboard** builds weekly leagues from its XP events; **classroom** and **analytics** read events only.
- The rules live in shared packages (`progress-rules`, `gamification-rules`, `search-rules`, `flags-rules`), so the in-browser demo backend and the services cannot disagree.
- The gateway's `GET /v1/home` combines the parts for the dashboard; a part that is down is left out and named in `partial`.

## Consequences
Every number has one owner and an event trail; services catch up a moment after an answer (eventual consistency, tests poll). A new reader of the data subscribes to events and never calls another service's database.
