import type { learning } from '@logicpath/contracts';
import { safeLocalStorage } from '@/shared/lib/storage';

/**
 * What the device still has to tell the server: attempts, and where the learner is in lessons.
 * It lives in localStorage, so closing the tab, going offline or learning before signing in
 * loses nothing. Everything has an id or is idempotent, so sending twice is harmless.
 */
export type QueueItem =
  | { kind: 'attempt'; request: learning.AttemptRequest }
  | {
      kind: 'position';
      conceptId: string;
      beat: learning.LessonPosition['beat'];
      practiceIndex: number;
    }
  | { kind: 'complete'; conceptId: string };

const KEY = 'logicpath:sync-queue';
const MAX_ITEMS = 500;

let items: QueueItem[] | null = null;
const listeners = new Set<() => void>();

/** Tells the sync loop there is something new to send. */
export function onEnqueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function load(): QueueItem[] {
  if (items) return items;
  try {
    const raw = safeLocalStorage.getItem(KEY) as string | null;
    items = raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    items = [];
  }
  return items;
}

function save() {
  try {
    safeLocalStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the queue still works for this visit.
  }
}

export const pending = (): readonly QueueItem[] => load();

export function enqueue(item: QueueItem) {
  const queue = load();
  // Only the last position per lesson matters.
  if (item.kind === 'position') {
    const at = queue.findIndex((q) => q.kind === 'position' && q.conceptId === item.conceptId);
    if (at >= 0) queue.splice(at, 1);
  }
  queue.push(item);
  if (queue.length > MAX_ITEMS) queue.splice(0, queue.length - MAX_ITEMS);
  save();
  for (const listener of listeners) listener();
}

/** Removes what was sent (by identity), keeping anything queued in the meantime. */
export function drop(sent: readonly QueueItem[]) {
  const gone = new Set(sent);
  items = load().filter((q) => !gone.has(q));
  save();
}

export function clearQueue() {
  items = [];
  save();
}
