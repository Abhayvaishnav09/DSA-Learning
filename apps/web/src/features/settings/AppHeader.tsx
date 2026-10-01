'use client';

import type { Locale } from '@logicpath/content-schema';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useReviewQueue } from '@/entities/progress/selectors';
import { track } from '@/shared/analytics/track';
import { useLocale, useT } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { useSettings, type Theme } from '@/shared/settings/store';

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', 'hi-Latn': 'Hinglish' };

export function AppHeader() {
  const t = useT();
  const locale = useLocale();
  const hydrated = useHydrated();
  const pathname = usePathname();
  const theme = useSettings((s) => s.theme);
  const setLocale = useSettings((s) => s.setLocale);
  const setTheme = useSettings((s) => s.setTheme);
  const { due } = useReviewQueue();

  // Keep <html> in sync for screen readers (lang) and colours (data-theme).
  useEffect(() => {
    document.documentElement.lang = locale === 'hi-Latn' ? 'hi-Latn' : 'en';
  }, [locale]);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const navLink = (href: string, label: string, badge?: number) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`relative rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'}`}
        aria-current={active ? 'page' : undefined}
      >
        {label}
        {!!badge && (
          <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-fg">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-lg focus:bg-surface focus:p-2"
      >
        {t.nav.skip}
      </a>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2">
        <Link href="/" className="mr-2 flex items-center gap-2 font-bold" aria-label={t.nav.home}>
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-accent font-mono text-accent-fg"
          >
            {'{}'}
          </span>
          <span className="hidden sm:inline">{t.appName}</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {navLink('/learn', t.nav.learn)}
          {navLink('/review', t.nav.review, hydrated ? due.length : 0)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="locale">
            {t.settings.language}
          </label>
          <select
            id="locale"
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            value={locale}
            onChange={(e) => {
              const next = e.target.value as Locale;
              setLocale(next);
              track({ name: 'locale_changed', locale: next });
            }}
          >
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="theme">
            {t.settings.theme}
          </label>
          <select
            id="theme"
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            value={hydrated ? theme : 'system'}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            {(['system', 'light', 'dark'] as const).map((th) => (
              <option key={th} value={th}>
                {t.settings.themes[th]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
