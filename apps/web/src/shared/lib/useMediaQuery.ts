'use client';

import { useSyncExternalStore } from 'react';

/** Live CSS media query match; false during server rendering. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
