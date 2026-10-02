'use client';

import { Button, cn, IconButton } from '@logicpath/ui';
import { PageTransition } from '@logicpath/ui/motion';
import { Bell, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import dynamic from 'next/dynamic';
import { LanguageSelect, SearchButton, UserMenu } from './Controls';
import { RouteGuard } from './Guard';
import { Logo } from './Logo';
import { AREA_HOME, type Area } from './nav';
import { BottomTabs, SideNav } from './Navigation';
import { useSmoothScroll } from './useSmoothScroll';

// The palette (cmdk) loads the first time someone opens it, not with every page.
const CommandMenu = dynamic(() => import('./Controls').then((m) => m.CommandMenu), { ssr: false });

function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main"
      className="sr-only z-[100] focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-lg focus:bg-surface focus:p-3 focus:shadow-floating"
    >
      {t.nav.skip}
    </a>
  );
}

/**
 * The signed-in app frame for students, writers and admins:
 * phone = top bar + bottom tabs, tablet = icon rail, desktop = collapsible sidebar.
 */
export function AppShell({ area, children }: { area: Area; children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteRequested, setPaletteRequested] = useState(false);
  const openPalette = () => {
    setPaletteRequested(true);
    setPaletteOpen(true);
  };
  // ⌘K / Ctrl+K works before the palette's code has loaded.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !paletteRequested) {
        e.preventDefault();
        setPaletteRequested(true);
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteRequested]);
  const signedIn = useSession((s) => s.status === 'signedIn');

  return (
    <div className="flex min-h-dvh">
      <SkipLink />
      <SideNav area={area} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="lp-glass lp-safe-top sticky top-0 z-30 border-b border-border">
          <div className="flex h-16 items-center gap-2 px-4 tablet:px-6">
            <Logo href={AREA_HOME[area]} label={t.nav.home} className="tablet:hidden" compact />
            <div className="flex-1" />
            <SearchButton onClick={openPalette} />
            <LanguageSelect />
            {signedIn && (
              <IconButton label={t.nav.notifications} asChild>
                <Link href={routes.notifications}>
                  <Bell />
                </Link>
              </IconButton>
            )}
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 pb-28 outline-none tablet:pb-12">
          <PageTransition routeKey={pathname}>
            <div className="mx-auto w-full max-w-6xl px-4 py-6 tablet:px-6 desktop:px-10 desktop:py-10">
              <RouteGuard>{children}</RouteGuard>
            </div>
          </PageTransition>
        </main>
      </div>
      <BottomTabs area={area} />
      {paletteRequested && <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} />}
    </div>
  );
}

/** Full-screen learning: no navigation, just an exit and the language, so nothing distracts. */
export function FocusShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="lp-glass lp-safe-top sticky top-0 z-30 border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <IconButton label={t.nav.exitLesson} asChild>
            <Link href={routes.learn}>
              <X />
            </Link>
          </IconButton>
          <div className="flex-1" />
          <LanguageSelect />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <RouteGuard>{children}</RouteGuard>
      </main>
    </div>
  );
}

/** Public pages: glass header with the main calls to action, rich footer. */
export function MarketingShell({ children }: { children: ReactNode }) {
  const t = useT();
  useSmoothScroll();
  const pathname = usePathname();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const links = [
    { href: routes.howItWorks, label: t.nav.howItWorks },
    { href: routes.developers, label: t.nav.developers },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="lp-glass lp-safe-top sticky top-0 z-30 border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 tablet:px-6">
          <Logo href={routes.landing} label={t.nav.home} />
          <nav aria-label={t.nav.main} className="ml-6 hidden items-center gap-1 tablet:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === l.href ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <LanguageSelect className="hidden tablet:block" />
          {signedIn ? (
            <Button asChild size="sm">
              <Link href={routes.home}>{t.nav.dashboard}</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden tablet:inline-flex">
                <Link href={routes.login()}>{t.nav.signIn}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={routes.signup()}>{t.nav.signUp}</Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-border bg-bg-elevated">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 tablet:grid-cols-[2fr_1fr_1fr] tablet:px-6">
          <div className="flex flex-col gap-3">
            <Logo href={routes.landing} label={t.nav.home} />
            <p className="max-w-sm text-sm text-muted">{t.landing.subtitle}</p>
          </div>
          <FooterColumn
            title={t.appName}
            links={[
              { href: routes.learn, label: t.nav.learn },
              { href: routes.howItWorks, label: t.nav.howItWorks },
              { href: routes.developers, label: t.nav.developers },
            ]}
          />
          <FooterColumn
            title={t.nav.account}
            links={[
              { href: routes.login(), label: t.nav.signIn },
              { href: routes.privacy, label: t.nav.privacy },
              { href: routes.terms, label: t.nav.terms },
            ]}
          />
        </div>
        <p className="border-t border-border py-6 text-center text-xs text-subtle">
          © {new Date().getFullYear()} LogicPath
        </p>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-muted hover:text-fg">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sign-in and sign-up: the form on one side, the brand on the other (stacked on phones). */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-h-dvh desktop:grid-cols-[1fr_1.1fr]">
      <SkipLink />
      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between px-4 tablet:px-8">
          <Logo href={routes.landing} label={t.nav.home} />
          <LanguageSelect />
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 items-center justify-center px-4 py-8 outline-none"
        >
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-gradient-to-br from-hero-from via-hero-via to-hero-to desktop:block"
      >
        <div className="absolute inset-0 grid place-items-center p-16">
          <div className="flex max-w-md flex-col gap-6">
            <pre className="animate-float rounded-2xl border border-border bg-surface/80 p-6 font-mono text-sm leading-7 shadow-floating backdrop-blur">
              {'count = 0\nfor i from 1 to 3:\n    count = count + 1\nsay count'}
            </pre>
            <p className="text-3xl font-bold leading-tight">{t.landing.title}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
