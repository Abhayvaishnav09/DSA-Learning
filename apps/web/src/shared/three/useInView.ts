'use client';

import { useEffect, useState, type RefObject } from 'react';

/** True while the element is on screen; scenes stop rendering when it isn't. */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? true),
      {
        rootMargin: '100px',
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}
