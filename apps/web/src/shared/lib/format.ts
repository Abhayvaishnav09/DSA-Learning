import type { Locale } from '@logicpath/content-schema';

const tag = (locale: Locale) => (locale === 'hi-Latn' ? 'en-IN' : 'en');

export const formatDate = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );

export const formatDateTime = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(tag(locale), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** "in 3 days", "2 hours ago": the nearest sensible unit. */
export function formatRelative(iso: string, locale: Locale, from: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - from.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

export const formatNumber = (n: number, locale: Locale): string =>
  new Intl.NumberFormat(tag(locale)).format(n);
