# ADR-0004: Two-layer code execution: browser workers + gVisor judge

- **Status:** Proposed
- **Date:** 2026-10-01

## Context
Learners need instant feedback, but mastery must not be fakeable and learner code is untrusted.

## Decision
Visible tests run in a Web Worker (JS native, Python via Pyodide). On submit, the judge runs hidden tests in a single-use gVisor sandbox with no network and strict limits. Only the judge verdict counts for mastery.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Browser only | Free, instant | Cheatable, hidden tests exposed |
| Third-party judge API | No ops | Cost per run, latency, data leaves our control |
| Firecracker from day one | Strongest isolation | More ops work; overkill at R2 scale |

## Consequences
Two runtimes must stay version-aligned. Judge runs in a separate account with no credentials.

## Revisit when
Judge volume or a security finding warrants Firecracker microVMs.
