# 06. Content System

Content is the product. It is treated exactly like code: versioned in git, reviewed in PRs, tested in CI, released and rolled back independently.

## 1. Layout

```
content/
  graph.yaml                         concepts + prerequisites (the knowledge graph)
  misconceptions.yaml                catalogue of misconception ids
  stages/
    02-repetition/
      loops.counter/
        concept.yaml                 title, stage, objectives, prerequisites
        lesson.mdx                   story + beats (MDX with whitelisted components)
        frames/see-1.ts              visualizer frames (authored) or code to trace
        items/
          trace-1.yaml
          trace-1.v2.yaml            variation
          predict-1.yaml
        locales/
          hi-Latn.yaml               Hinglish strings for everything above
  assets/                            images, audio (optimised in CI)
```

## 2. Item format

```yaml
id: item:loops.counter.trace-1
concept: concept:loops.counter
type: trace-table
difficulty: 1                 # 1..5
variationOf: null
prompt: >
  i starts at 1 and total starts at 0. Fill in the table.
payload:
  code: |
    total = 0
    for i in 1..3:
      total = total + i
  columns: [i, total]
answer:                       # moved to server-only answer_key at build time
  rows: [[1, 1], [2, 3], [3, 6]]
wrongAnswers:                 # map common wrong patterns to misconceptions
  - match: { rows: [[0, 0], [1, 1], [2, 3], [3, 6]] }
    misconception: loop.off-by-one.extra
hints:
  - Look at one pass of the loop at a time.
  - Each pass, total grows by the current value of i.
  - "Pass 1: total = 0 + 1 = 1. Now do pass 2."
explanation: Each pass adds i to total, so total goes 1, 3, 6.
explainWhy:
  question: Why is the last total 6?
  options: [ "1 + 2 + 3 = 6", "The loop runs 6 times", "total starts at 6" ]
  correct: 0
tags: [loops, accumulate]
estSeconds: 60
```

Code items add `language`, `starter`, `visibleTests`, `hiddenTests`, `referenceSolution`, `timeLimitMs`, `memoryLimitMb`.

## 3. Validation pipeline (CI on every content PR)

| Check | Fails when |
|---|---|
| Schema | Any file doesn't match the Zod schema in `packages/content-schema` |
| Graph | Cycle in prerequisites, missing concept, orphan concept, stage order violated |
| References | Unknown misconception id, item points to missing concept |
| Solvable | Code items: reference solution must pass all tests; must fail on a known-wrong solution (tests have teeth) |
| Determinism | Visualizer frames regenerate identically |
| i18n | Missing locale strings, ICU syntax errors |
| Readability | Lesson text above reading-level threshold (warning) |
| Accessibility | Images without alt text, frames without captions |
| Size | Bundle per concept > 200 KB |
| Preview | A preview deployment link posted on the PR so reviewers click through the real lesson |

## 4. Build and release

1. `content build` compiles YAML/MDX into per-concept JSON bundles + a manifest, content-hashed.
2. **Answer keys are stripped** from client bundles and loaded into `content.items.answer_key` on the server. Non-code items still need client grading for instant feedback, so for those the client gets a salted hash of the correct answer (stops casual peeking; the server re-grades anyway).
3. Upload to object storage; register the version via `/internal/content/versions`.
4. Activate: either instantly or as a **staged rollout** (flag: 10% → 50% → 100%).
5. Roll back by activating the previous version.

Attempts record `content_version`, so stats and mastery stay correct across versions.

## 5. Authoring workflow

| Step | Tool |
|---|---|
| Scaffold a concept | `pnpm content new concept loops.counter` |
| Live preview | `pnpm content dev` (local web app with hot reload on content files) |
| Lint and validate | `pnpm content check` (same checks as CI) |
| Review | PR with preview link; reviewer checklist (accuracy, simplicity, misconceptions, i18n) |
| Improve with data | Author dashboard: per-item correct rate, median time, top misconceptions, drop-off beat |
| AI assist (R3) | Draft variations, hints and Hinglish strings; **a human always reviews** before merge |

Later (R5), a web-based authoring UI writes the same files through the GitHub API, so non-developers can author without changing the pipeline.

## 6. Content quality loop

```
publish ─► learners attempt ─► nightly item stats ─► flags:
   correct rate < 30%  → too hard or unclear
   correct rate > 98%  → too easy, cut or harden
   one wrong option > 50% of errors → missing misconception feedback
   drop-off at a beat  → beat is confusing
─► author fixes ─► new version ─► compare before/after
```
