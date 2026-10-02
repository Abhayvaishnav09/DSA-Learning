'use client';

import { domMax, LazyMotion, MotionConfig, useReducedMotion } from 'motion/react';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

/** The learner's setting: everything, gentle (fades only, no movement), or none at all. */
export type MotionMode = 'full' | 'reduced' | 'off';

interface MotionPrefs {
  /** Effective mode: the stricter of the setting and the OS "reduce motion" preference. */
  mode: MotionMode;
  /** Large movement (parallax, 3D camera flights, slides) is allowed. */
  allowMovement: boolean;
  /** Any animation at all is allowed. */
  allowAnimation: boolean;
}

const MotionContext = createContext<MotionPrefs>({
  mode: 'full',
  allowMovement: true,
  allowAnimation: true,
});

const RANK: Record<MotionMode, number> = { full: 0, reduced: 1, off: 2 };

/**
 * One place that decides how much the UI moves (WCAG 2.3.3). It honours the OS setting and the
 * in-app one, configures `motion` accordingly, and marks <html data-motion> so CSS animations
 * follow too. Lazy-loads motion's features so pages only pay for what they use.
 */
export function MotionProvider({
  mode = 'full',
  children,
}: {
  mode?: MotionMode;
  children: ReactNode;
}) {
  const osReduced = useReducedMotion() ?? false;
  const effective: MotionMode =
    RANK[mode] >= RANK[osReduced ? 'reduced' : 'full'] ? mode : 'reduced';

  useEffect(() => {
    document.documentElement.dataset.motion = effective;
  }, [effective]);

  const prefs = useMemo<MotionPrefs>(
    () => ({
      mode: effective,
      allowMovement: effective === 'full',
      allowAnimation: effective !== 'off',
    }),
    [effective],
  );

  return (
    <MotionContext.Provider value={prefs}>
      <LazyMotion features={domMax} strict>
        <MotionConfig
          reducedMotion={effective === 'full' ? 'never' : 'always'}
          transition={effective === 'off' ? { duration: 0 } : undefined}
        >
          {children}
        </MotionConfig>
      </LazyMotion>
    </MotionContext.Provider>
  );
}

export const useMotionPrefs = () => useContext(MotionContext);
