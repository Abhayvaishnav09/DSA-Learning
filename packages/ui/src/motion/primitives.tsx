'use client';

import { animate, AnimatePresence, m, useInView, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useMotionPrefs } from './MotionProvider';
import { DURATION, EASE_OUT_EXPO, rise, transitions } from './tokens';

/**
 * Route-level transition. Keyed by the path so each page fades and rises in; the old page is
 * not kept around (no exit), which keeps navigation instant and avoids layout jumps.
 */
export function PageTransition({
  routeKey,
  children,
  className,
}: {
  routeKey: string;
  children: ReactNode;
  className?: string;
}) {
  const { allowMovement } = useMotionPrefs();
  return (
    <m.div
      key={routeKey}
      className={className}
      initial={{ opacity: 0, y: allowMovement ? 10 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.page, ease: EASE_OUT_EXPO }}
    >
      {children}
    </m.div>
  );
}

/** Fades and rises into view the first time it scrolls on screen. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const { allowMovement } = useMotionPrefs();
  return (
    <m.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: allowMovement ? 24 : 0 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...transitions.slow, delay }}
    >
      {children}
    </m.div>
  );
}

/** A list whose children (<StaggerItem>) enter one after another. */
export function Stagger({
  children,
  className,
  as = 'div',
  step = 0.05,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol';
  step?: number;
}) {
  const Component = as === 'ul' ? m.ul : as === 'ol' ? m.ol : m.div;
  return (
    <Component
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: step } } }}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const Component = as === 'li' ? m.li : m.div;
  return (
    <Component className={className} variants={rise} transition={transitions.slow}>
      {children}
    </Component>
  );
}

/** Animates a number up (XP, streaks, stats). Shows the final value at once without motion. */
export function CountUp({
  value,
  className,
  format = (n) => Math.round(n).toLocaleString(),
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const { allowAnimation } = useMotionPrefs();
  const motionValue = useMotionValue(0);
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (!allowAnimation) return;
    const controls = animate(motionValue, value, {
      duration: 0.9,
      ease: EASE_OUT_EXPO,
      onUpdate: setAnimated,
    });
    return () => controls.stop();
  }, [value, allowAnimation, motionValue]);

  return (
    <span className={cn('tabular-nums', className)} aria-label={format(value)}>
      <span aria-hidden>{format(allowAnimation ? animated : value)}</span>
    </span>
  );
}

/** Wraps content that should pop in when it changes (e.g. a new badge, a feedback banner). */
export function PopSwap({
  id,
  children,
  className,
}: {
  id: string | number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.div
        key={id}
        className={className}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={transitions.spring}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

/** Gentle horizontal shake for a wrong answer (skipped when movement is reduced). */
export function useShake(): [ref: React.RefObject<HTMLDivElement | null>, shake: () => void] {
  const ref = useRef<HTMLDivElement>(null);
  const { allowMovement } = useMotionPrefs();
  const shake = () => {
    if (!allowMovement || !ref.current) return;
    void animate(ref.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.36 });
  };
  return [ref, shake];
}
