'use client';

import type { Locale } from '@logicpath/content-schema';
import { useSyncExternalStore } from 'react';
import { useHydrated } from '../lib/useHydrated';
import { useSettings } from '../settings/store';
import { en, type Messages } from './messages';

/**
 * English ships with every page. Hinglish is fetched the first time someone needs it (and
 * kept), so the people who read English do not download it. Until it arrives English shows.
 */
let hinglish: Messages | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadHinglish(): Promise<void> {
  loading ??= import('./messages.hi').then((module) => {
    hinglish = module.hiLatn;
    for (const listener of listeners) listener();
  });
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * The learner's locale. Until hydration finishes it is always English, so the first client
 * render matches the server HTML.
 */
export function useLocale(): Locale {
  const hydrated = useHydrated();
  const locale = useSettings((s) => s.locale);
  return hydrated ? locale : 'en';
}

export function useT(): Messages {
  const locale = useLocale();
  const loaded = useSyncExternalStore(
    subscribe,
    () => hinglish,
    () => null,
  );
  return locale === 'hi-Latn' && loaded ? loaded : en;
}

export function formatDay(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'hi-Latn' ? 'en-IN' : 'en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

/** Picks the right set of words for screens that keep their own strings next to their code. */
export function useStrings<T>(strings: { en: T; 'hi-Latn': T }): T {
  return strings[useLocale()];
}
