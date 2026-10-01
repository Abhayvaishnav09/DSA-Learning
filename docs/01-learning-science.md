# 01. Learning Science

This is the heart of the product. The tech exists to serve this doc.

## 1. The lesson loop

Every lesson follows the same six beats. Same rhythm every time, so learners spend their attention on the idea, not the interface.

| Beat | What the learner does | Why it works |
|---|---|---|
| 1. **Story** | Reads a 2 to 3 line real-life problem ("find the tallest student in a line") | Concrete before abstract; links to what they already know |
| 2. **See** | Watches the logic run step by step (play, pause, step back) | Worked examples beat solving from scratch for novices |
| 3. **Predict** | Commits to "what happens next?" before it is revealed | Prediction forces active processing; a wrong guess makes the correction memorable |
| 4. **Do** | Solves a small item | Retrieval practice |
| 5. **Explain** | Picks *why* the answer is right | Self-explanation; catches lucky guesses |
| 6. **Recall** | Meets the idea again days later | Spacing effect; the only real proof of learning |

**Rules**
- One concept per lesson, 5 to 10 minutes.
- Max 3 new terms per lesson, each introduced in plain words before the technical word ("a box that holds a value, called a *variable*").
- Faded scaffolding: early items are worked examples, then partly worked (fill the blank), then independent.
- Every item has at least one **variation** (same logic, different surface) so memorising answers does not work.

## 2. Curriculum as a knowledge graph

Concepts form a **directed acyclic graph** of prerequisites, not a flat list. A concept unlocks only when all its prerequisites are mastered.

```
sequence ─► decision(if) ─► compound-condition(AND/OR/NOT) ─► truth-table
    │            │
    ▼            ▼
variable ─► counter-loop ─► accumulate(sum) ─► min-max ─► array-scan ─► two-pointers
                 │                                          │
                 ▼                                          ▼
            nested-loop ───────────────────────────► sorting-idea ─► binary-search
```

| Stage | Concepts (examples) | Item types |
|---|---|---|
| 0. Thinking | sequence, order matters, yes/no decisions, patterns, decomposition | arrange, odd-one-out, predict |
| 1. Logic basics | variable, assignment, if/else, AND/OR/NOT, truth tables, comparison | predict, fill, truth-table |
| 2. Repetition | counter loop, while loop, accumulate, min/max, nested loop | trace table, predict, arrange |
| 3. Building blocks | function, parameter, return, string, array, index | code, trace, fill |
| 4. Problem solving | frequency count, two pointers, sliding window, sorting idea, binary search | code |
| 5. DSA | recursion, stack, queue, linked list, hash map, tree, BFS/DFS, heap, DP | code, visual trace |
| 6. Interview | mixed timed sets, complexity reasoning, edge cases | code, MCQ |

Target size: about 150 concepts and about 2,000 items (including variations) by R4.

## 3. Mastery model

We need a number that says "does this learner know concept C?" We use **Bayesian Knowledge Tracing (BKT)** per learner per concept. It is well understood, cheap to compute and easy to explain.

Parameters per concept (fit from data later, start with defaults):

| Param | Meaning | Default |
|---|---|---|
| `p_init` | Knows it before the lesson | 0.10 |
| `p_learn` | Learns it on each practice step | 0.20 |
| `p_slip` | Knows it but answers wrong | 0.10 |
| `p_guess` | Doesn't know it but answers right | 0.20 (MCQ uses 1/options) |

Update after each attempt:

```
if correct:  p = p(1-slip) / (p(1-slip) + (1-p)guess)
else:        p = p·slip   / (p·slip + (1-p)(1-guess))
p = p + (1-p)·learn
```

Adjustments:
- **Hints** reduce the evidence. An answer after hint level *h* counts as `correct with weight (1 − 0.3h)`.
- **Explain-why wrong** after a right answer counts as a half-wrong (lucky guess).
- **Mastered** means `p ≥ 0.95` **and** a correct delayed-recall item on a later calendar day.
- **Decay**: if a review of a mastered concept fails, mastery drops and the concept re-enters practice.

R4+: move to a richer model (e.g. a logistic model per item with difficulty fitted from data) once there are enough attempts. The `MasteryModel` interface in the backend makes this a drop-in swap. See [ADR-0005](adr/0005-bkt-and-fsrs.md).

## 4. Spaced repetition

Each attempted item becomes a **review card**. Scheduling uses **FSRS** (Free Spaced Repetition Scheduler), a modern open algorithm that predicts the forgetting curve per card.

- The grade comes from the attempt: wrong = *Again*, right with hints = *Hard*, right = *Good*, right and fast = *Easy*.
- Target retention: 0.90.
- Daily review cap: 20 cards (configurable), so reviews never crowd out new learning.
- Reviews show **variations** of the original item when available.
- The scheduler runs on the server (source of truth) and in the browser (so offline review still works). Both use the same shared package.

## 5. Misconceptions and feedback

Every wrong option and every common wrong code output is tagged with a **misconception** id.

| Misconception id | Wrong mental model | Feedback |
|---|---|---|
| `loop.off-by-one.extra` | "A loop from 1 to 5 runs 6 times" | Shows the counter values in a table, 5 rows |
| `assign.is-equality` | "`x = x + 1` is impossible because x ≠ x + 1" | Animates the box: read old value, add, store back |
| `and-or.swap` | Treats AND like OR | Truth table with the learner's row highlighted |

Uses:
- The feedback for a wrong answer explains *that* misconception, not a generic "try again".
- Repeated misconceptions trigger a targeted mini-lesson.
- Analytics shows which misconceptions are most common, which tells authors where to improve teaching.

## 6. Hints

Three levels per item, authored by hand (AI-assisted in R3):

1. **Nudge**: points to where to look ("watch what happens to `total` each time").
2. **Approach**: names the strategy ("keep a running total and add each number").
3. **Near-solution**: a partially worked answer with one step left.

The full solution shows only after an attempt and hint 3, or after 3 wrong attempts.

## 7. Motivation without dark patterns

| Do | Don't |
|---|---|
| Streaks with a weekly "freeze" | Guilt notifications |
| Show mastered concepts growing on the map | Fake urgency, loss-framing |
| Celebrate first-try correct on hard items | Leaderboards that shame beginners (opt-in only, later) |
| Daily goal set by the learner (5/10/20 min) | Infinite feeds |

## 8. Experimentation

Teaching choices are hypotheses. The platform supports A/B tests on content (e.g. animation vs static diagram for a concept), measured on **delayed recall**, not immediate correctness. See [04-backend](04-backend.md#feature-flags-and-experiments).

## 9. Accessibility of learning

- Reading level target: grade 6 to 8 English. Short sentences.
- Every animation has a text step list (for screen readers and slow connections).
- Hinglish locale is written by people, not machine-translated (AI may draft, a human signs off).
- Colour is never the only signal (correct/wrong also use icons and text).
