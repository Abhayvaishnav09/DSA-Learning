'use client';

import { cn, Tooltip } from '@logicpath/ui';
import { m } from '@logicpath/ui/motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useReviewQueue } from '@/entities/progress/selectors';
import { useT } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import { useSettings } from '@/shared/settings/store';
import { Logo } from './Logo';
import { AREA_HOME, AREA_NAV, isActive, type Area, type NavItem } from './nav';

function useItems(area: Area): NavItem[] {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return AREA_NAV[area].filter((item) => !item.signedIn || signedIn);
}

/** Count shown next to Review: what's due today. */
function useBadge(href: string): number {
  const hydrated = useHydrated();
  const { due } = useReviewQueue();
  return hydrated && href === routes.review ? due.length : 0;
}

function SideLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const badge = useBadge(item.href);
  const label = item.label(t);
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}
      className={cn(
        'relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && (
        <m.span
          layoutId="side-active"
          className="absolute inset-0 rounded-xl bg-accent-soft"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          aria-hidden
        />
      )}
      <item.icon className="relative size-5 shrink-0" aria-hidden />
      {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
      {badge > 0 && (
        <span
          className={cn(
            'relative grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-fg',
            collapsed && 'absolute top-1.5 right-1.5 min-w-4 px-1 text-[10px]',
          )}
          aria-hidden={collapsed}
        >
          {badge}
        </span>
      )}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/**
 * Tablet: an icon rail. Desktop: a full sidebar the learner can collapse to the rail.
 * Hidden on phones, which use the bottom tab bar.
 */
export function SideNav({ area }: { area: Area }) {
  const t = useT();
  const hydrated = useHydrated();
  const stored = useSettings((s) => s.sidebarCollapsed);
  const toggle = useSettings((s) => s.toggleSidebar);
  const items = useItems(area);
  const collapsedOnDesktop = hydrated && stored;

  const list = (collapsed: boolean) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.href}>
          <SideLink item={item} collapsed={collapsed} />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Tablet rail */}
      <nav
        aria-label={t.nav.main}
        className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center gap-6 border-r border-border bg-bg-elevated px-3 py-4 tablet:flex desktop:hidden"
      >
        <Logo href={AREA_HOME[area]} label={t.nav.home} compact />
        {list(true)}
      </nav>
      {/* Desktop sidebar */}
      <nav
        aria-label={t.nav.main}
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 border-r border-border bg-bg-elevated px-3 py-4 transition-[width] duration-300 desktop:flex',
          collapsedOnDesktop ? 'w-20 items-center' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-2',
            collapsedOnDesktop ? 'flex-col' : 'px-1',
          )}
        >
          <Logo href={AREA_HOME[area]} label={t.nav.home} compact={collapsedOnDesktop} />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsedOnDesktop ? t.nav.expand : t.nav.collapse}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          >
            {collapsedOnDesktop ? (
              <PanelLeftOpen className="size-5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden />
            )}
          </button>
        </div>
        <div className="w-full flex-1 overflow-y-auto">{list(collapsedOnDesktop)}</div>
      </nav>
    </>
  );
}

/** Phone: the primary destinations as a thumb-reachable bar, with a sliding active pill. */
export function BottomTabs({ area }: { area: Area }) {
  const t = useT();
  const pathname = usePathname();
  const items = useItems(area)
    .filter((i) => i.primary)
    .slice(0, 5);
  return (
    <nav
      aria-label={t.nav.main}
      className="lp-glass lp-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border tablet:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <BottomTab item={item} active={active} />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BottomTab({ item, active }: { item: NavItem; active: boolean }) {
  const t = useT();
  const badge = useBadge(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-colors',
        active ? 'text-accent' : 'text-muted',
      )}
    >
      {active && (
        <m.span
          layoutId="tab-active"
          className="absolute inset-x-2 inset-y-0.5 rounded-xl bg-accent-soft"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          aria-hidden
        />
      )}
      <item.icon className="relative size-5" aria-hidden />
      <span className="relative">{item.label(t)}</span>
      {badge > 0 && (
        <span className="absolute top-0.5 right-1/2 translate-x-4 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-fg">
          {badge}
        </span>
      )}
    </Link>
  );
}
