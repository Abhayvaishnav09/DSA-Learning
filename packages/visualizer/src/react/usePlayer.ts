import { useEffect, useState } from 'react';

export interface PlayerOptions {
  /** Number of frames. */
  count: number;
  /** Highest frame the learner may reach (e.g. a predict pause). Defaults to the last frame. */
  limit?: number;
  autoPlay?: boolean;
  initialSpeedMs?: number;
}

export const SPEEDS_MS = [1600, 1000, 500] as const;

/**
 * Playback state. Position and "is it moving" are derived from the limit rather than synced
 * into state, so raising the limit (after a prediction) makes a playing animation continue.
 */
export function usePlayer({
  count,
  limit,
  autoPlay = false,
  initialSpeedMs = 1000,
}: PlayerOptions) {
  const last = Math.max(0, Math.min(limit ?? count - 1, count - 1));
  const [rawIndex, setIndex] = useState(0);
  const [wantsToPlay, setWantsToPlay] = useState(autoPlay);
  const [speedMs, setSpeedMs] = useState(initialSpeedMs);

  const index = Math.min(rawIndex, last);
  const atEnd = index >= last;
  const playing = wantsToPlay && !atEnd;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), speedMs);
    return () => clearTimeout(timer);
  }, [playing, index, last, speedMs]);

  const stopAt = (i: number) => {
    setWantsToPlay(false);
    setIndex(Math.max(0, Math.min(i, last)));
  };

  return {
    index,
    last,
    atEnd,
    playing,
    speedMs,
    setSpeedMs,
    play: () => {
      if (index >= count - 1) setIndex(0);
      setWantsToPlay(true);
    },
    pause: () => setWantsToPlay(false),
    next: () => stopAt(index + 1),
    prev: () => stopAt(index - 1),
    restart: () => stopAt(0),
    goTo: stopAt,
  };
}
