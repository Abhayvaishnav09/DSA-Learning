import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** False during server render and hydration, true afterwards. Gates UI that depends on saved progress. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
