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

## 5. Visualizing learner code (Python, in the browser)

The **Visualize your code** screen (`/visualize`) runs pasted or uploaded Python with Pyodide in a Worker (`packages/visualizer/src/python`). Nothing is sent to a server.

| Piece | What it does |
|---|---|
| `tracer.ts` | Runs the program under `sys.settrace`: a snapshot of every variable per line, conditions with their results, loop rounds. Capped at 1,000 steps and 5 s. |
| `detect.ts` | Names about 25 algorithms from the code's shape (`ast`): searches, simple and divide-and-conquer sorts, two pointers, sliding window, prefix sums, hashing, stack, BFS/DFS, Kadane, DP, memoization, GCD, sieve, prime check, fast power, recursion. No clear match, no name. |
| `derive.ts` | **Works Big-O out from the structure**, step by step: loop counts (n, log n when something halves, √n for `i * i <= n`, harmonic sums), nesting, built-ins that hide work (`sorted`, `in` on a list, slices), recursion solved by its recurrence (master theorem, n − 1 chains, branching, memo, graph traversal). Best case: loops that can stop early on the data. Lines whose count depends on the data are marked unsure. |
| `measure.ts` + `complexity.ts` | **Measures** it: grows the input (a list or number written in the code, a list passed straight into a call, text, an adjacency dict, what `input()` reads, or a made-up call for a file of functions only) from 8 to 8192, counts lines and fits O(1)…O(2ⁿ). Searches run with the key first/middle/last/missing; sorts with sorted/reversed/shuffled lists; numbers as powers of two and as primes. |
| `verdict.ts` | One answer from both. Agreement = **certain**. Otherwise the structure explains the gap: work hidden in built-ins, n against n log n too close to measure, inputs that never reach the worst case (`gcd(n, n)`). If a loop depends on the data, the measurement is used and the answer is shown as an estimate. |
| `corpus.ts` | 30 programs as students write them, each with its textbook answer. The tests check the name, the derived and measured Big-O, a certain final answer, and the textbook value for each one. |

No tool can prove the running time of every possible program (Rice's theorem), so certainty comes from two independent methods agreeing. Where they cannot agree, the screen says it is an estimate and names the line responsible.
