import { useSyncExternalStore } from 'react';

/** Hash routing for the single-file demo build: #/learn/loops.counter → /learn/loops.counter. */
let current = '/';
current = read();

function read(): string {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  // Ignore in-page anchors such as the skip link (#main).
  return hash.startsWith('/') ? hash : (current ?? '/');
}

const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = read();
    if (next !== current) {
      current = next;
      listeners.forEach((l) => l());
    }
  });
}

export function usePathname(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => '/',
  );
}
