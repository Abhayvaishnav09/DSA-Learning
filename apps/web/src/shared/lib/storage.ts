import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage that never throws: private windows, blocked storage and server rendering
 * all fall back to "nothing saved" instead of crashing the lesson.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      // Storage full or blocked: progress for this session only.
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      // ignore
    }
  },
};
