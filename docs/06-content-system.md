# 06. Content System

Content is the product. It is treated exactly like code: versioned in git, reviewed in PRs, tested in CI, released and rolled back independently.

## 1. Layout

```
content/
  graph.yaml                         stages, concepts, prerequisites (the knowledge graph)
  misconceptions.yaml                catalogue of misconception ids with explanations
  concepts/
    loops.counter/                   a concept is published when its folder has lesson.yaml
      lesson.yaml                    story, see (program + caption overrides), predict, practice ids, recap
      items/
        how-many.yaml
        how-many.v2.yaml             variation (variationOf: loops.counter.how-many), used in reviews
        predict-last.yaml
        trace.yaml
        arrange.yaml
        fill.yaml
  dist/bundle.json                   build output (not committed)
```

Every learner-facing string is written inline in every locale (`{ en: ..., hi-Latn: ... }`), so authors and reviewers see the translations side by side and a missing one fails the schema. Visualizer frames are not authored: the pseudocode interpreter in `packages/visualizer` generates them from the program, with automatic narration that authors can override per frame.

## 2. Item format

Five item types exist today: `mcq`, `predict-output`, `arrange-steps`, `fill-blank`, `trace-table`. The full schema is `packages/content-schema/src/schema.ts`. A trace table:

```yaml
id: loops.counter.trace
concept: loops.counter
type: trace-table
difficulty: 2                 # 1..5
prompt:
  en: Fill in the table. Write the value of i and steps each time line 3 finishes.
  hi-Latn: Table bharo. Har baar line 3 khatam hone par i aur steps ki value likho.
code: |
  steps = 0
  for i from 1 to 3:
      steps = steps + 2
line: 3                       # a row is recorded each time this line finishes
columns: [i, steps]
rows: [["1", "2"], ["2", "4"], ["3", "6"]]   # checked against the real run in CI
given: [[0, 0]]               # cells shown pre-filled
wrongAnswers:                 # known wrong tables → misconception feedback
  - match: [["1", "1"], ["2", "2"], ["3", "3"]]
    misconception: assign.adds-one-always
hints: [...]                  # 1 to 3 levels: nudge, approach, near-solution
explanation: { en: ..., hi-Latn: ... }
explainWhy:                   # optional "why is that right?" check after a correct answer
  question: { en: ..., hi-Latn: ... }
  options: [{ text: {...}, correct: true }, { text: {...} }]
estSeconds: 60
```

Grading is lenient where it should be: `arrange-steps` accepts any order that runs and behaves the same, and `fill-blank` accepts any fill that produces the expected output (logic first, not memorised answers).

Code items in real languages (R2) add `language`, `starter`, `visibleTests`, `hiddenTests`, `referenceSolution`, `timeLimitMs`, `memoryLimitMb`.

## 3. Validation pipeline (CI on every content PR)

| Check | Fails when |
|---|---|
| Schema | Any file doesn't match the Zod schema in `packages/content-schema` |
| Graph | Cycle in prerequisites, missing concept, orphan concept, stage order violated |
| References | Unknown misconception id, item points to missing concept |
| Solvable | Every program runs. Answer keys match what the program really shows (predict, trace, fill, arrange). Known wrong answers do not grade as correct. The shuffled arrange order is not already correct. R2 code items: reference solution passes all tests and a known-wrong solution fails (tests have teeth) |
| Determinism | Visualizer frames regenerate identically |
| i18n | Missing locale strings, ICU syntax errors |
| Readability | Lesson text above reading-level threshold (warning) |
| Accessibility | Images without alt text, frames without captions |
| Size | Bundle per concept > 200 KB |
| Preview | A preview deployment link posted on the PR so reviewers click through the real lesson |

## 4. Build and release

1. `content build` compiles the YAML into a JSON bundle whose version is a hash of its content (R1: per-concept bundles + a manifest).
2. **R0 (today):** there is no server yet, so the bundle includes answer keys and the browser grades. **From R1, answer keys are stripped** from client bundles and loaded into `content.items.answer_key` on the server. Non-code items still need client grading for instant feedback, so for those the client gets a salted hash of the correct answer (stops casual peeking; the server re-grades anyway).
3. Upload to object storage; register the version via `/internal/content/versions`.
4. Activate: either instantly or as a **staged rollout** (flag: 10% → 50% → 100%).
5. Roll back by activating the previous version.

Attempts record `content_version`, so stats and mastery stay correct across versions.

## 5. Authoring workflow

| Step | Tool |
|---|---|
| Scaffold a concept | Copy `content/concepts/loops.counter` (a `content new` generator comes later) |
| Live preview | `pnpm --filter @logicpath/content build`, then `pnpm dev` and open the lesson |
| Lint and validate | `pnpm content:check` (same checks as CI, with file names and line numbers) |
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
