# DSA-Learning: System Design (v0.1)

A website that teaches **programming logic from zero**, then grows into DSA and interview prep. The learner starts with no programming knowledge and ends able to solve interview problems. Every step is small, and every idea must be *understood*, not memorised.

## 1. Goals and non-goals

**Goals**
- Take a person with zero programming knowledge to confident problem solving.
- Teach in tiny steps: one idea, one simple question, instant feedback.
- Make logic "sink in" by seeing it, predicting it, then writing it.
- Work for interview prep: later levels map to real DSA topics.

**Non-goals (v1)**
- No social features, live classes, or video hosting.
- No native mobile app (the site must be mobile friendly).
- No support for many languages (start with one).

## 2. Learner

| Trait | Design consequence |
|---|---|
| Zero programming knowledge | No jargon without a plain-words explanation first; no blank code editor on day 1 |
| Students / interview prep | A clear path to DSA; track progress and weak topics |
| May be Hindi/Hinglish-comfortable | Content schema supports multiple languages (English first, Hinglish later) |

## 3. Learning method (the core of the product)

Every lesson follows the same loop, so the learner always knows what comes next:

1. **Story**: a real-life situation (e.g. "find the tallest student in a line").
2. **See it**: a step-by-step animation of the logic running on the example.
3. **Predict**: "what happens next?" The learner commits to an answer before seeing it.
4. **Do it**: a small question. Early on this is arranging steps or filling blanks. Later it is real code.
5. **Explain it**: a one-line "why does this work?" check.
6. **Recall later**: spaced repetition resurfaces the idea after 1, 3, 7 and 14 days.

Rules:
- One concept per lesson, 5 to 10 minutes.
- Hints come in 3 levels (nudge, approach, near-solution). The full solution unlocks only after an attempt.
- Wrong answers explain *why* they are wrong.
- A concept unlocks only after the previous one is mastered (shown by recall, not just completion).

## 4. Curriculum map

| Stage | Topic | Question style |
|---|---|---|
| 0. Thinking | Steps, order, yes/no decisions, patterns | Arrange steps, spot the odd one, trace a recipe |
| 1. Logic basics | Variables, conditions (if/else), AND/OR/NOT, truth tables | Predict the output, fix the condition |
| 2. Repetition | Loops, counting, sum, min/max | Trace a loop table, then write it |
| 3. Building blocks | Functions, strings, arrays | Write small functions against tests |
| 4. Problem solving | Patterns: two pointers, frequency count, sorting idea | Classic easy problems |
| 5. DSA | Recursion, stack/queue, linked list, trees, graphs, DP | Interview-style problems |
| 6. Interview mode | Mixed timed practice, weak-topic drills | Mock sets |

Each stage is a set of *concepts*; each concept has lessons and 5 to 15 questions of rising difficulty.

## 5. Question types

| Type | Used in | Checked by |
|---|---|---|
| Multiple choice / predict output | All stages | Exact match |
| Arrange the steps (drag and drop) | 0 to 2 | Order match |
| Fill the blank | 1 to 3 | Token match |
| Trace table (fill variable values per step) | 2 to 4 | Cell match |
| Write code | 3 to 6 | Run against hidden tests in a sandbox |
| Explain why (pick the right reason) | All | Exact match |

## 6. Features

**MVP**
- Accounts (email/Google) plus guest mode with local progress.
- Lesson player with step-by-step visualizer.
- Question engine: first four question types plus code questions.
- In-browser code editor with run and test results.
- Progress map, daily streak, and a daily review queue (spaced repetition).
- 3-level hints.

**Later**
- Hinglish content, dark mode, bookmarks and notes.
- Weak-topic analytics and an interview mode with timer.
- Content authoring dashboard.
- Leaderboards (only if learners ask for them).

## 7. Architecture

```
                 +--------------------+
   Browser  ---> |  Web app (SPA)     |  lessons, visualizer, editor
                 +---------+----------+
                           | HTTPS / JSON
                 +---------v----------+
                 |  API server        |  auth, progress, content, review queue
                 +----+----------+----+
                      |          |
            +---------v--+   +---v------------+
            | PostgreSQL |   | Code runner    |  isolated sandbox, hidden tests
            +------------+   +----------------+
                      |
               +------v------+
               | Content repo|  lessons as versioned files (Markdown + JSON)
               +-------------+
```

Key decisions:
- **Content as files, not DB rows.** Lessons and questions live in the repo as Markdown/JSON, reviewed through PRs, and are loaded into the DB at deploy. This keeps authoring cheap and changes reviewable.
- **Client-side execution first.** v1 runs JavaScript learner code in a Web Worker in the browser. This costs nothing, has no server-side attack surface, and gives instant feedback. A server-side sandbox (containers with CPU/memory/time limits and no network) comes only when other languages are added.
- **Stateless API.** Easy to scale horizontally; sessions are tokens.
- **Offline-tolerant.** Guest progress lives in local storage and merges into the account at sign-up.

## 8. Tech stack (proposed)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Large ecosystem, good for interactive visualizers |
| Editor | Monaco or CodeMirror | In-browser code editing |
| Visualizer | SVG with a small step-engine (state array of frames) | Deterministic, easy to author |
| Backend | Node.js + TypeScript (Fastify) | One language across the stack |
| DB | PostgreSQL | Relational progress and review data |
| Auth | Email + Google OAuth, or a hosted provider | Do not hand-roll auth |
| Hosting | Static host for the SPA, one small container for the API | Cheap to start |

## 9. Data model

```
User(id, email, name, locale, created_at)

Stage(id, order, title)
Concept(id, stage_id, order, title, prerequisites[])
Lesson(id, concept_id, order, title, content_ref, est_minutes)
Question(id, concept_id, type, difficulty, payload_json, hints_json, explanation)

Attempt(id, user_id, question_id, answer_json, correct, hints_used, time_ms, created_at)
ConceptProgress(user_id, concept_id, status, mastery, updated_at)
ReviewItem(user_id, question_id, due_at, interval_days, ease)   -- spaced repetition
Streak(user_id, current, longest, last_active_date)
```

`mastery` rises with correct answers without hints and falls on mistakes. A concept counts as *mastered* only after a correct answer on a later day (this is the recall check).

## 10. API (v1)

```
POST /auth/signup | /auth/login | /auth/logout
GET  /map                          stages, concepts, user status
GET  /concepts/:id                 lessons plus questions
POST /questions/:id/attempt        { answer } -> { correct, explanation }
GET  /questions/:id/hint/:level    increments hints_used
GET  /review/today                 due review items
POST /progress/merge               import guest progress
GET  /me/stats                     streak, mastery by topic
```

Code questions are graded in the browser worker; the client submits the result, and the server re-verifies it by re-running tests for any answer that counts toward mastery. This stops trivial cheating without a full server sandbox.

## 11. Content format

```json
{
  "id": "loops-sum-1",
  "type": "trace_table",
  "difficulty": 1,
  "prompt": "i starts at 1 and total at 0. Fill the table.",
  "payload": { "code": "total = 0\nfor i in 1..3: total = total + i", "columns": ["i", "total"] },
  "hints": ["Look at one pass at a time.", "total grows by i each pass."],
  "explanation": "Each pass adds i, so total goes 1, 3, 6."
}
```

Lessons are Markdown with embedded visualizer scripts (a list of frames: data state plus a highlighted line plus a caption).

## 12. Non-functional requirements

| Area | Target |
|---|---|
| Performance | First lesson interactive in under 2 s on a mid-range phone |
| Security | Learner code never runs on the server in v1; passwords hashed by the auth provider; rate-limit attempts |
| Privacy | Store only email, name and progress; allow account deletion |
| Accessibility | Keyboard-operable, screen-reader labels, colour-blind-safe visualizer |
| Reliability | Progress writes are idempotent; local queue retries when offline |
| Observability | Error tracking plus per-question correct-rate (find confusing questions) |

## 13. Build plan

1. **Foundations**: repo, frontend shell, content loader, one concept end to end (lesson, visualizer, 5 questions).
2. **Question engine**: all question types except code.
3. **Code questions**: editor, worker runner, test cases.
4. **Accounts and progress**: auth, attempts, mastery, streaks.
5. **Review queue**: spaced repetition and daily review page.
6. **Content**: write Stages 0 to 2 (about 25 concepts), then test with real learners.
7. **Polish and launch**: accessibility, performance, analytics.

## 14. Open questions

- Which language first? Suggested: **Python** for readability, or **JavaScript** because it runs natively in the browser worker. JavaScript is the cheaper start. Python (via Pyodide) is friendlier for beginners.
- Should lessons be in Hinglish from day one, or English first?
- Free only, or a paid tier for interview mode later?
