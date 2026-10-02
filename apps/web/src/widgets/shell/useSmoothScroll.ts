'use client';

import { useMotionPrefs } from '@logicpath/ui/motion';
import { useEffect } from 'react';

/** Inertia scrolling for the long marketing pages only, and only when movement is allowed. */
export function useSmoothScroll() {
  const { allowMovement } = useMotionPrefs();
  useEffect(() => {
    if (!allowMovement) return;
    let destroy = () => {};
    let cancelled = false;
    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({ autoRaf: true, lerp: 0.12, anchors: true });
      destroy = () => lenis.destroy();
    });
    return () => {
      cancelled = true;
      destroy();
    };
  }, [allowMovement]);
}
