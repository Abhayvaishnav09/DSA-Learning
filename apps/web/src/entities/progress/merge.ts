import type { learning } from '@logicpath/contracts';
import type { ConceptState, ReviewCard } from '@logicpath/learning-engine';
import type { LessonProgress, Streak } from './store';

/** What a device keeps (the learning engine's state). */
export interface DeviceProgress {
  concepts: Record<string, ConceptState>;
  cards: Record<string, ReviewCard>;
  lessons: Record<string, LessonProgress>;
  streak: Streak;
}

const BEAT_ORDER = ['story', 'see', 'predict', 'practice', 'recap'] as const;

/**
 * Joins what the server knows with what this device has done. Nothing is ever lost: for each
 * concept the side that has seen more attempts wins, for each card the newer review wins, and a
 * finished lesson stays finished. Used when someone signs in on a device that learned as a guest
 * (or that is catching up after being offline).
 */
export function mergeProgress(
  device: DeviceProgress,
  server: learning.EngineState,
): DeviceProgress {
  const concepts: Record<string, ConceptState> = { ...server.concepts };
  for (const [id, local] of Object.entries(device.concepts)) {
    const remote = server.concepts[id];
    if (!remote || local.attempts > remote.attempts) concepts[id] = local;
  }

  const cards: Record<string, ReviewCard> = { ...server.cards };
  for (const [id, local] of Object.entries(device.cards)) {
    const remote = server.cards[id];
    if (!remote || (local.lastReview ?? '') > (remote.lastReview ?? '')) cards[id] = local;
  }

  const lessons: Record<string, LessonProgress> = {};
  for (const id of new Set([...Object.keys(server.lessons), ...Object.keys(device.lessons)])) {
    const remote = server.lessons[id];
    const local = device.lessons[id];
    const fromServer = remote && {
      beat: remote.beat,
      practiceIndex: remote.practiceIndex,
      startedAt: remote.startedAt,
      completedAt: remote.completedAt,
    };
    if (!fromServer) lessons[id] = local!;
    else if (!local) lessons[id] = fromServer;
    else {
      const done = fromServer.completedAt ?? local.completedAt;
      const furthest =
        BEAT_ORDER.indexOf(local.beat) > BEAT_ORDER.indexOf(fromServer.beat) ? local : fromServer;
      lessons[id] = {
        ...furthest,
        startedAt: fromServer.startedAt < local.startedAt ? fromServer.startedAt : local.startedAt,
        completedAt: done,
      };
    }
  }

  const a = device.streak;
  const b = server.streak;
  const streak =
    (a.lastActiveOn ?? '') > (b.lastActiveOn ?? '') ||
    (a.lastActiveOn === b.lastActiveOn && a.current > b.current)
      ? a
      : b;
  return {
    concepts,
    cards,
    lessons,
    streak: { ...streak, longest: Math.max(a.longest, b.longest, streak.current) },
  };
}
