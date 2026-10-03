import { summarize, type Complexity, type RawMeasurement } from './complexity';
import { TRACER_PY } from './tracer';
import { framesFromTrace, type RawTrace, type Recognised } from './toFrames';
import type { Derived } from './verdict';

/** Pyodide version this tracer is tested with; the web app serves the same files. */
export const PYODIDE_VERSION = '314.0.7';
export const PYODIDE_CDN = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`;
export const TIME_LIMIT_MS = 5000;
/** Measuring runs the program about 25 times (measure.ts stops itself after 3.5 s). */
const MEASURE_LIMIT_MS = 8000;

/**
 * The worker, as source text so every bundler (Next, the single-file demo) can start it from a
 * Blob. It has no DOM; once Python is up, network APIs are removed before any learner code runs.
 */
const WORKER_JS = `
let calls = null;
self.onmessage = async (event) => {
  const { id, base, tracer, task, code, stdin } = event.data;
  try {
    if (!calls) {
      const { loadPyodide } = await import(base + 'pyodide.mjs');
      const py = await loadPyodide({ indexURL: base, stdout: () => {}, stderr: () => {} });
      py.runPython(tracer);
      calls = { trace: py.globals.get('trace'), measure: py.globals.get('measure') };
      for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
        try { self[name] = undefined; } catch {}
      }
      self.postMessage({ id, status: 'ready' });
    }
    self.postMessage({ id, json: calls[task](code, stdin) });
  } catch (error) {
    self.postMessage({ id, failed: String((error && error.message) || error) });
  }
};
`;

export type PythonStatus = 'loading' | 'running';

export interface RunPythonOptions {
  /** Where pyodide.mjs and its files are served (absolute or relative to the page). */
  baseUrl?: string;
  stdin?: string;
  timeoutMs?: number;
  onStatus?: (status: PythonStatus) => void;
}

let worker: Worker | null = null;
let ready = false;
let nextId = 0;

function startWorker(): Worker {
  const url = URL.createObjectURL(new Blob([WORKER_JS], { type: 'text/javascript' }));
  const created = new Worker(url, { type: 'module', name: 'python-tracer' });
  URL.revokeObjectURL(url);
  return created;
}

function stopWorker() {
  worker?.terminate();
  worker = null;
  ready = false;
}

/** Loading Python failed (offline, blocked download). Not the learner's fault. */
export class PythonUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PythonUnavailableError';
  }
}

/**
 * Calls the Python side in a Web Worker. The first call downloads Python (about 13 MB, cached
 * by the browser afterwards). A call that runs past the time limit is stopped by killing the
 * worker; the next call starts a fresh one.
 */
function callPython<T>(
  task: 'trace' | 'measure',
  code: string,
  options: RunPythonOptions,
  onTimeout: (limit: number) => T,
): Promise<T> {
  const base = new URL(options.baseUrl ?? PYODIDE_CDN, globalThis.location?.href).href;
  const limit = options.timeoutMs ?? (task === 'trace' ? TIME_LIMIT_MS : MEASURE_LIMIT_MS);
  worker ??= startWorker();
  const current = worker;
  const id = ++nextId;
  options.onStatus?.(ready ? 'running' : 'loading');

  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => {
        cleanup();
        stopWorker();
        resolve(onTimeout(limit));
      }, limit);
    };
    const cleanup = () => {
      clearTimeout(timer);
      current.removeEventListener('message', onMessage);
      current.removeEventListener('error', onError);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { id: number; status?: string; json?: string; failed?: string };
      if (data.id !== id) return;
      if (data.status === 'ready') {
        ready = true;
        options.onStatus?.('running');
        arm();
        return;
      }
      cleanup();
      if (data.json !== undefined) resolve(JSON.parse(data.json) as T);
      else {
        if (!ready) stopWorker();
        reject(new PythonUnavailableError(data.failed ?? 'Python could not start'));
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      stopWorker();
      reject(new PythonUnavailableError(event.message || 'Python could not start'));
    };
    current.addEventListener('message', onMessage);
    current.addEventListener('error', onError);
    // The time limit counts the program only, not the one-off download.
    if (ready) arm();
    current.postMessage({ id, base, tracer: TRACER_PY, task, code, stdin: options.stdin ?? '' });
  });
}

/** Runs real Python and returns its raw trace. */
export function runPython(code: string, options: RunPythonOptions = {}): Promise<RawTrace> {
  return callPython('trace', code, options, (limit) => ({
    events: [],
    error: { type: 'Timeout', message: String(limit), line: 0 },
  }));
}

/** Runs Python and returns frames ready for the player, plus the algorithms it recognised. */
export async function tracePython(
  code: string,
  options: RunPythonOptions = {},
): Promise<{
  frames: ReturnType<typeof framesFromTrace>;
  algorithms: Recognised[];
  derived: Derived | null;
}> {
  const trace = await runPython(code, options);
  return {
    frames: framesFromTrace(trace, code),
    algorithms: trace.algorithms ?? [],
    derived: trace.derived ?? null,
  };
}

/**
 * Measures how the program's work grows with its input (measure.ts) and fits a Big-O to it.
 * Null when the program has no input to grow (no list or number written in the code).
 */
export async function measurePython(
  code: string,
  options: RunPythonOptions = {},
): Promise<Complexity | null> {
  const raw = await callPython<RawMeasurement>('measure', code, options, () => ({
    mode: null,
    series: [],
    timedOut: true,
  }));
  return summarize(raw);
}
