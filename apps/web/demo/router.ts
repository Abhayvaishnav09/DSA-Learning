import { useSyncExternalStore } from 'react';

/**
 * Hash routing for the single-file demo build: #/learn/loops.counter?x=1 → path /learn/loops.counter.
 * Mirrors the parts of next/navigation the app uses.
 */
function readHash(): { path: string; search: string } {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  // In-page anchors such as the skip link (#main) are not routes.
  if (!hash.startsWith('/')) return state;
  const [path = '/', search = ''] = hash.split('?');
  return { path, search };
}

let state = { path: '/', search: '' };
state = readHash();

const listeners = new Set<() => void>();
function update() {
  const next = readHash();
  if (next.path !== state.path || next.search !== state.search) {
    state = next;
    listeners.forEach((l) => l());
  }
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', update);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => state.path,
    () => '/',
  );
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribe,
    () => state.search,
    () => '',
  );
  return new URLSearchParams(search);
}

export function navigate(href: string, replace = false) {
  const url = `#${href}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  update();
  window.scrollTo({ top: 0 });
}
