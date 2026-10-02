'use client';

import type { ContentBundle } from '@logicpath/content-schema';
import { create } from 'zustand';
import { getApiClient } from '@/shared/api/client';
import { bundle, setBundle } from './bundle';

/** Bumped whenever new content is swapped in, so the app can redraw everything that reads it. */
export const useContentVersion = create<{ version: number }>(() => ({ version: 0 }));

let checking: Promise<boolean> | null = null;

/**
 * Compares the live curriculum with the one in use and downloads the new one when they differ,
 * so a lesson published in the studio shows up for learners without a new app release.
 * Failures are ignored: the shipped content always works offline.
 */
export function refreshContent(): Promise<boolean> {
  checking ??= (async () => {
    try {
      const api = getApiClient();
      const manifest = await api.call('content.manifest');
      if (manifest.checksum === bundle.version) return false;
      const next = (await api.call('content.bundle')) as ContentBundle;
      setBundle(next);
      useContentVersion.setState((s) => ({ version: s.version + 1 }));
      return true;
    } catch {
      return false;
    } finally {
      checking = null;
    }
  })();
  return checking;
}
