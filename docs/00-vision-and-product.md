# 00. Vision and Product

## Vision

> Anyone who can read can learn to think like a programmer, one small step at a time, and walk into a coding interview confident.

Most DSA platforms (LeetCode, HackerRank, etc.) assume you can already code. Most beginner courses teach syntax, not thinking. LogicPath sits in the gap: it teaches **logic first**, uses code only once the logic is understood, and stays with the learner up to interview level.

## Problem

| Pain | Evidence we expect to see | Our answer |
|---|---|---|
| Beginners freeze in front of a blank editor | High drop-off on the first coding exercise | No blank editor until Stage 3. Before that: arrange, predict, trace, fill |
| People memorise solutions, not patterns | They solve a problem once and fail a small variation | Variations of each item, delayed recall, "explain why" checks |
| Learning everything at once | Overwhelm, quitting in week 1 | One concept per lesson, prerequisite graph gates what comes next |
| No idea what they are weak at | Random practice | Mastery per concept plus a weak-topic drill |
| English-heavy material | Hindi/Hinglish speakers struggle with jargon | Plain words first; Hinglish as a first-class locale |

## Personas

| Persona | Situation | Wants | Success for them |
|---|---|---|---|
| **Riya, first-year student** | No coding background, 30 to 60 min per day, mostly on phone | To not feel lost; to pass college programming | Writes a loop-based program alone after 3 weeks |
| **Arjun, job seeker** | Knows a little Python, panics in interviews | Patterns and practice under time | Solves easy and medium problems in 25 min |
| **Meera, career switcher** | Non-CS job, evenings only | Structure, steady progress, motivation | Finishes Stages 0 to 4 in 3 months |
| **Content author (internal)** | Writes lessons | Fast authoring, preview, validation | Ships a concept in under a day |
| **Admin (internal)** | Runs the platform | See health, fix content, manage users | Finds a broken item within minutes |

## North-star and key metrics

**North-star:** weekly *concepts mastered*. A concept counts as mastered only when the mastery model is above 0.95 **and** the learner passed a delayed recall item at least 1 day later.

| Area | Metric | Target (6 months after launch) |
|---|---|---|
| Activation | New users who finish the first lesson | ≥ 70% |
| Learning | Median days from first lesson to Stage 2 mastered | ≤ 14 |
| Retention | Day 7 / Day 30 return rate | ≥ 40% / ≥ 20% |
| Recall | Correct rate on review items | 80 to 90% (higher means reviews are too easy) |
| Content quality | Items with < 30% or > 98% correct rate | < 5% of items |
| Performance | p75 Largest Contentful Paint on mobile | < 2.0 s |
| Reliability | API availability | 99.9% monthly |

## Scope by release

| Release | Theme | In | Out |
|---|---|---|---|
| **R0: Prototype** (internal) | Prove the lesson loop | 1 concept end to end, visualizer engine, 4 non-code item types, local progress | Accounts, backend |
| **R1: MVP** (public beta) | Learn Stages 0 to 2 | Accounts, guest mode, all item types except code, mastery model, review queue, streaks, progress map, English + Hinglish | Code items, AI |
| **R2: Code** | Learn Stages 3 to 4 | Code editor, JS + Python in browser, server re-grading, trace tables for real code | AI |
| **R3: AI tutor** | Personal help | AI hints, "explain my mistake", code feedback, Socratic tutor chat | AI-generated content in production without review |
| **R4: Interview** | Stages 5 to 6 | DSA content, timed mock sets, weak-topic drills, shareable progress | Live human mocks |
| **R5: Scale** | Growth | Mobile app (shared core), institutions/classrooms, paid tier | — |

## User journeys

**First visit (guest, under 3 minutes to first "aha")**
1. Landing page: one sentence and a "Start learning, no signup" button.
2. A 3-question placement check ("have you written code before?"). It picks the start concept.
3. First lesson: a story, an animation, a predict question. Correct, with confetti.
4. After lesson 2: "Save your progress?" prompts signup. Guest progress merges.

**Daily return**
1. Home shows: streak, "3 reviews due", "next: Loops with a counter".
2. Reviews first (2 to 3 minutes), then the new lesson.
3. End screen: what you mastered today, and what comes back tomorrow.

**Stuck on an item**
1. Wrong answer: explanation of *this specific* mistake (misconception-based).
2. Hint ladder: nudge, then approach, then near-solution.
3. R3+: "Ask the tutor": a guided conversation that never just hands over the answer.
4. Item is re-queued later as a variation.

## Monetisation (decided later, designed for now)

Default plan: **free core** (all lessons and practice). Paid tier later for AI tutor quota, interview mode and certificates. The system design keeps an `entitlements` module from R1 so pricing can change without code surgery. See [ADR-0007](adr/0007-free-core-entitlements.md).

## Non-goals (for now)

- Video courses, live classes, forums or social feeds.
- Competitive programming (Codeforces-style).
- Languages beyond JavaScript and Python before R5.
