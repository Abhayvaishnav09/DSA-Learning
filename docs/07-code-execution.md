# 07. Code Execution

Learner code is **untrusted input**. It may loop forever, eat memory, or try to escape. The design has two layers.

## 1. Layer 1: in the browser (instant feedback)

| Language | Runtime | Isolation |
|---|---|---|
| JavaScript | Dedicated Web Worker running a small harness | No DOM; `fetch`/`XMLHttpRequest`/`importScripts` removed before user code runs; CSP blocks network |
| Python | Pyodide (CPython on WebAssembly) in a Worker | Same, plus Pyodide's virtual filesystem |

- **Timeouts:** the main thread terminates the worker after `timeLimitMs` (default 2 s) and starts a fresh one.
- **Infinite-loop detection:** code is instrumented with a loop counter (JS via an AST transform; Python via `sys.settrace` budget). Hitting the cap reports "your loop never stopped" with the line number, which is a teaching moment, not a crash.
- **Tracing for the visualizer:** the same instrumentation records variable state per line → visualizer frames.
- Runs **visible tests only**. Results are shown immediately but marked "pending server check".

Browser results are a UX feature, never trusted for mastery.

## 2. Layer 2: the judge (authoritative)

```
api ──JudgeJob──► queue ──► judge supervisor ──► sandbox (per job, fresh)
                                   │                 ├─ language runtime (node / python)
                                   │                 ├─ user code + hidden tests
                                   │                 └─ limits: CPU 2 s, wall 5 s, mem 256 MB,
                                   │                    pids 32, no network, read-only rootfs,
                                   │                    tmpfs 16 MB, output 64 KB
                                   ◄──── result (per-test pass/fail, stdout excerpt, timing)
api ◄──JudgeResult event
```

| Concern | Decision |
|---|---|
| Isolation tech | **gVisor** (runsc) containers in R2; evaluate **Firecracker** microVMs at scale. See [ADR-0004](adr/0004-sandboxed-judge.md) |
| Hardening | seccomp profile, no capabilities, non-root uid, no network namespace, cgroup v2 limits |
| Warm pool | Pre-started sandboxes per language for < 300 ms start; each used **once** then destroyed |
| Placement | Separate node pool / account, no IAM permissions, no route to internal networks |
| Output | Truncated and escaped; never rendered as HTML |
| Determinism | Fixed seeds, frozen time, same runtime versions as browser where possible |
| Throughput | Autoscale on queue depth; target p95 queue wait < 1 s |
| Abuse | Per-user rate limits; repeated resource-limit hits flag the account for review |

## 3. Why both layers

| | Browser only | Server only | Both (chosen) |
|---|---|---|---|
| Speed | Instant | 0.5 to 2 s | Instant + confirmed |
| Cost | Free | Compute per run | Server runs only on submit |
| Cheat-proof | No | Yes | Yes |
| Offline | Yes | No | Practice offline, confirm on sync |

## 4. Interface

```ts
interface JudgeJob {
  jobId: string; attemptId: string; language: 'javascript' | 'python';
  code: string; itemId: string; contentVersion: string; // hidden tests resolved by the judge
}
interface JudgeResult {
  jobId: string; verdict: 'accepted' | 'wrong_answer' | 'runtime_error' | 'time_limit' | 'memory_limit' | 'compile_error' | 'internal_error';
  tests: { name: string; passed: boolean; hidden: boolean; message?: string }[];
  cpuMs: number; memoryKb: number;
}
```

Hidden test names and expected values are never returned to the client, only pass/fail counts and the first failing visible test.
