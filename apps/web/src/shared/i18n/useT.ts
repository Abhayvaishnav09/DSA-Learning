'use client';

import type { Locale } from '@logicpath/content-schema';
import { useHydrated } from '../lib/useHydrated';
import { useSettings } from '../settings/store';
import { en, hiLatn, type Messages } from './messages';

export const MESSAGES: Record<Locale, Messages> = { en, 'hi-Latn': hiLatn };

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
  return MESSAGES[useLocale()];
}

export function formatDay(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'hi-Latn' ? 'en-IN' : 'en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}
