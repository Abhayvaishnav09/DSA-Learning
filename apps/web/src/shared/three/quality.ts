'use client';

import { useMotionPrefs } from '@logicpath/ui/motion';
import { useSyncExternalStore } from 'react';

/**
 * How much 3D this device gets (ADR-0020):
 * - high: full scene, up to 1.75x pixel ratio.
 * - low:  fewer objects and particles, 1x pixel ratio (cheap phones, few cores, little memory).
 * - lite: no WebGL at all; the 2D version is shown (no WebGL2, data saver, reduced or no
 *         animations, or `?lite=1` for testing and for anyone who prefers it).
 */
export type Tier = 'high' | 'low' | 'lite';

interface DeviceHints {
  webgl2: boolean;
  memoryGb: number;
  cores: number;
  saveData: boolean;
  forceLite: boolean;
}

export function pickTier(hints: DeviceHints, allowMovement: boolean): Tier {
  if (hints.forceLite || !hints.webgl2 || hints.saveData || !allowMovement) return 'lite';
  if (hints.memoryGb <= 2 || hints.cores <= 4) return 'low';
  return 'high';
}

function readHints(): DeviceHints {
  let webgl2: boolean;
  try {
    webgl2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const search = new URLSearchParams(location.search || location.hash.split('?')[1] || '');
  return {
    webgl2,
    memoryGb: nav.deviceMemory ?? 4,
    cores: nav.hardwareConcurrency ?? 4,
    saveData: nav.connection?.saveData ?? false,
    forceLite: search.get('lite') === '1',
  };
}

let cached: DeviceHints | null = null;
const deviceHints = () => (cached ??= readHints());
const noChanges = () => () => {};

/**
 * The tier for this device and the learner's animation setting. Null during server rendering
 * and hydration (so the HTML matches), then known on the client.
 */
export function useTier(): Tier | null {
  const { allowMovement } = useMotionPrefs();
  const hints = useSyncExternalStore(noChanges, deviceHints, () => null);
  return hints ? pickTier(hints, allowMovement) : null;
}
