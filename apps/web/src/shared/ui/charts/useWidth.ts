'use client';

import { useLayoutEffect, useRef, useState } from 'react';

const clamp = (width: number) => Math.max(200, Math.round(width));

/**
 * The width of an element, kept up to date as it resizes (charts lay themselves out in pixels).
 * Measured before the first paint so a narrow screen never flashes a too-wide drawing.
 */
export function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(clamp(element.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(clamp(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
