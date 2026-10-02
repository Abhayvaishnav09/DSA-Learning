'use client';

import { ApiError } from '@logicpath/api-client';
import type { learning } from '@logicpath/contracts';
import { getApiClient } from '@/shared/api/client';
import { useSession } from '@/shared/session/store';
import { drop, pending, type QueueItem } from '@/shared/sync/queue';
import { mergeProgress } from './merge';
import { useProgress } from './store';

const BATCH = 50;

/** Errors worth retrying later (network, server trouble, rate limit, expired sign-in). */
const transient = (error: unknown) =>
  !(error instanceof ApiError) ||
  error.status === 0 ||
  error.status >= 500 ||
  error.status === 429 ||
  error.status === 401;

let running: Promise<boolean> | null = null;

/**
 * Sends everything waiting in the queue, in order. Stops at the first problem that might go
 * away (offline, server down) and keeps the rest; a request the server rejects for good (a
 * question that no longer exists) is dropped so it cannot block the others.
 * Returns true when something was sent.
 */
export function flushQueue(): Promise<boolean> {
  if (useSession.getState().status !== 'signedIn') return Promise.resolve(false);
  running ??= (async () => {
    let sent = false;
    try {
      const api = getApiClient();
      const queue = [...pending()];
      for (let i = 0; i < queue.length;) {
        const item = queue[i]!;
        if (item.kind === 'attempt') {
          const batch: Extract<QueueItem, { kind: 'attempt' }>[] = [];
          while (i < queue.length && batch.length < BATCH && queue[i]!.kind === 'attempt') {
            batch.push(queue[i] as (typeof batch)[number]);
            i += 1;
          }
          try {
            await api.call('practice.sync', {
              body: { attempts: batch.map((b) => b.request) },
            });
            drop(batch);
            sent = true;
          } catch (error) {
            if (transient(error)) return sent;
            // One bad attempt spoils the batch: send them one by one to find it.
            for (const single of batch) {
              try {
                await api.call('practice.attempt', { body: single.request });
                sent = true;
              } catch (inner) {
                if (transient(inner)) return sent;
              }
              drop([single]);
            }
          }
        } else {
          i += 1;
          try {
            if (item.kind === 'position') {
              await api.call('progress.lesson.position', {
                params: { conceptId: item.conceptId },
                body: { beat: item.beat, practiceIndex: item.practiceIndex },
              });
            } else {
              await api.call('progress.lesson.complete', { params: { conceptId: item.conceptId } });
            }
            sent = true;
          } catch (error) {
            if (transient(error)) return sent;
          }
          drop([item]);
        }
      }
    } finally {
      running = null;
    }
    return sent;
  })();
  return running;
}

/** Brings a device up to date with the server: everything it learned is merged in. */
export async function hydrateFromServer(): Promise<void> {
  if (useSession.getState().status !== 'signedIn') return;
  const server: learning.EngineState = await getApiClient().call('progress.state');
  const progress = useProgress.getState();
  progress.importProgress(
    mergeProgress(
      {
        concepts: progress.concepts,
        cards: progress.cards,
        lessons: progress.lessons,
        streak: progress.streak,
      },
      server,
    ),
  );
}
