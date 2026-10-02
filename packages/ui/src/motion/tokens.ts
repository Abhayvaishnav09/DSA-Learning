import type { Transition } from 'motion/react';

/** JS mirror of the CSS motion tokens in styles/ui.css. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const DURATION = { fast: 0.12, base: 0.2, slow: 0.36, page: 0.42 } as const;

export const transitions = {
  fast: { duration: DURATION.fast, ease: EASE_OUT_EXPO },
  base: { duration: DURATION.base, ease: EASE_OUT_EXPO },
  slow: { duration: DURATION.slow, ease: EASE_OUT_EXPO },
  /** Lively but settles fast: buttons, badges, toggles. */
  spring: { type: 'spring', stiffness: 520, damping: 32, mass: 0.8 },
  /** Soft and slow: sheets, page elements, cards growing into pages. */
  gentle: { type: 'spring', stiffness: 220, damping: 28 },
} satisfies Record<string, Transition>;

/** Small entrance used across the app: fade and rise a few pixels. */
export const rise = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
} as const;
