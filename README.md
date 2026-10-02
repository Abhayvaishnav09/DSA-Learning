# LogicPath (DSA-Learning)

[![CD](https://github.com/Abhayvaishnav09/DSA-Learning/actions/workflows/cd.yml/badge.svg)](https://github.com/Abhayvaishnav09/DSA-Learning/actions/workflows/cd.yml) [![Security](https://github.com/Abhayvaishnav09/DSA-Learning/actions/workflows/security.yml/badge.svg)](https://github.com/Abhayvaishnav09/DSA-Learning/actions/workflows/security.yml)

A website that teaches programming logic from zero, one small step at a time, all the way to interview-level data structures and algorithms.

**Status:** R0 prototype. One complete concept (*Loops with a counter*) runs end to end in English and Hinglish, with progress saved on the device. The full plan is in [`docs/`](docs/README.md).

## What a lesson looks like

1. **Story**: a real-life situation and at most three new words.
2. **See it**: the program runs step by step, with boxes (variables), a screen (output) and plain-words narration.
3. **Predict**: the animation pauses; the learner guesses what happens next, then watches.
4. **Do it**: five small questions of different types, with a three-level hint ladder, feedback that names the exact mistake, and a "why is that right?" check.
5. **Recap**, then **reviews** on later days. A concept counts as mastered only when it is remembered on a later day.

## Run it

Needs Node 22.12+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm --filter @logicpath/content build   # compile and check the lessons
pnpm dev                                 # http://localhost:3000
```

## Checks

```sh
pnpm content:check   # schema, knowledge graph, and every answer key verified by running the code
pnpm lint
pnpm typecheck
pnpm test            # unit + property tests
pnpm build
pnpm test:e2e        # Playwright: full lesson, resume, Hinglish, keyboard-only, axe accessibility
```

If Chromium is already installed somewhere (e.g. a cloud dev box), set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path instead of running `playwright install`.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js app: landing, learning path, lesson player, reviews |
| `packages/learning-engine` | Mastery model (Bayesian Knowledge Tracing) and review scheduler (FSRS) |
| `packages/visualizer` | Beginner pseudocode interpreter that produces step frames and narration, plus the React player |
| `packages/grader` | Grades every question type, shared by browser and (later) server |
| `packages/content-schema` | Content types (Zod) |
| `packages/content-tools` | Loads, checks and builds the content bundle (`logicpath-content` CLI) |
| `content/` | The curriculum: knowledge graph, misconceptions, lessons and questions |
| `docs/` | Product, architecture, frontend, backend, data, AI, infrastructure, security, testing and project plan, plus ADRs |
