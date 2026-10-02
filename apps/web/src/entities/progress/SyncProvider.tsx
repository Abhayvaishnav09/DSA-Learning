'use client';

import { useInvalidateApi } from '@logicpath/api-client/react';
import type { EndpointId } from '@logicpath/contracts';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { refreshContent, useContentVersion } from '@/shared/content/live';
import { useSession } from '@/shared/session/store';
import { onEnqueue } from '@/shared/sync/queue';
import { flushQueue, hydrateFromServer } from './flush';

/** Screens that show numbers the learner just changed. */
const AFFECTED: EndpointId[] = [
  'home',
  'progress.get',
  'rewards.me',
  'leaderboard.league',
  'reviews.summary',
  'reviews.due',
  'notifications.list',
];

const SYNC_EVERY_MS = 30_000;
const CONTENT_RECHECK_MS = 5 * 60_000;

/**
 * Keeps the device and the server in step: sends what the learner did (after a moment, when
 * the connection returns, and every half minute), brings progress down when someone signs in,
 * and swaps in newly published lessons. A new curriculum redraws the app once.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const invalidate = useInvalidateApi();
  const version = useContentVersion((s) => s.version);

  const refresh = useCallback(() => invalidate(AFFECTED), [invalidate]);

  const send = useCallback(async () => {
    if (await flushQueue()) refresh();
  }, [refresh]);

  // Signing in: send what was learned as a guest, then take what the server has.
  useEffect(() => {
    if (status !== 'signedIn') return;
    void (async () => {
      await flushQueue();
      try {
        await hydrateFromServer();
      } catch {
        // Offline right now: the next sync tries again.
      }
      refresh();
    })();
  }, [status, refresh]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const later = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(), 1200);
    };
    const stop = onEnqueue(later);
    const interval = setInterval(() => void send(), SYNC_EVERY_MS);
    const online = () => void send();
    window.addEventListener('online', online);
    return () => {
      stop();
      clearInterval(interval);
      window.removeEventListener('online', online);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [send]);

  // New lessons published since the app was opened.
  useEffect(() => {
    void refreshContent();
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > CONTENT_RECHECK_MS) void refreshContent();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // `key` redraws everything that read the old curriculum.
  return (
    <div key={version} className="contents">
      {children}
    </div>
  );
}
