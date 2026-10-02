'use client';

import type { Locale } from '@logicpath/content-schema';
import {
  Avatar,
  Button,
  CommandPalette,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadio,
  MenuSeparator,
  MenuTrigger,
  type CommandItem,
} from '@logicpath/ui';
import { BookOpen, LogOut, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { track } from '@/shared/analytics/track';
import { bundle, text } from '@/shared/content/bundle';
import { useLocale, useT } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { routes } from '@/shared/routing/routes';
import { hasRole, useSession } from '@/shared/session/store';
import { useSettings, type Theme } from '@/shared/settings/store';
import { AREA_HOME, AREA_NAV, AREA_ROLE, type Area } from './nav';

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', 'hi-Latn': 'Hinglish' };

/** Always visible: Hinglish is a first-class language here, not a buried setting. */
export function LanguageSelect({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSettings((s) => s.setLocale);
  return (
    <select
      aria-label={t.settings.language}
      className={`h-9 rounded-lg border border-border bg-surface px-2 text-sm font-medium hover:border-border-strong ${className ?? ''}`}
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
  );
}

export function UserMenu() {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const { status, user, signOut } = useSession();
  const { theme, setTheme, motion, setMotion } = useSettings();

  if (!hydrated || status === 'unknown')
    return <span className="size-9 rounded-full bg-surface-2" aria-hidden />;
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link href={routes.login()}>{t.nav.signIn}</Link>
      </Button>
    );
  }

  const areas = (['student', 'studio', 'admin'] as Area[]).filter((a) =>
    hasRole(user, AREA_ROLE[a]),
  );
  const areaLabel: Record<Area, string> = {
    student: t.nav.studentArea,
    studio: t.nav.studio,
    admin: t.nav.admin,
  };

  return (
    <Menu>
      <MenuTrigger className="rounded-full" aria-label={t.nav.account}>
        <Avatar name={user.name} seed={user.id} size="sm" decorative />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="block font-semibold">{user.name}</span>
          <span className="block text-xs text-muted">{user.email}</span>
        </MenuLabel>
        <MenuSeparator />
        {areas.length > 1 &&
          areas.map((area) => (
            <MenuItem key={area} onSelect={() => router.push(AREA_HOME[area])}>
              {t.nav.switchTo}: {areaLabel[area]}
            </MenuItem>
          ))}
        {areas.length > 1 && <MenuSeparator />}
        <MenuItem icon={<Settings />} onSelect={() => router.push(routes.settings)}>
          {t.nav.settings}
        </MenuItem>
        <MenuSeparator />
        <MenuRadio<Theme>
          label={t.settings.theme}
          value={theme}
          onChange={setTheme}
          options={(['system', 'light', 'dark'] as const).map((v) => ({
            value: v,
            label: t.settings.themes[v],
          }))}
        />
        <MenuRadio
          label={t.settings.motion}
          value={motion}
          onChange={setMotion}
          options={(['full', 'reduced', 'off'] as const).map((v) => ({
            value: v,
            label: t.settings.motions[v],
          }))}
        />
        <MenuSeparator />
        <MenuItem
          icon={<LogOut />}
          danger
          onSelect={() => {
            void signOut().then(() => router.push(routes.landing));
          }}
        >
          {t.nav.signOut}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** ⌘K: every page the person can open, plus lessons by name. */
export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const user = useSession((s) => s.user);

  const items = useMemo<CommandItem[]>(() => {
    const areas = (['student', 'studio', 'admin'] as Area[]).filter(
      (a) => a === 'student' || hasRole(user, AREA_ROLE[a]),
    );
    const pages = areas.flatMap((area) =>
      AREA_NAV[area]
        .filter((item) => !item.signedIn || user)
        .map((item) => ({
          id: `${area}:${item.href}`,
          label:
            area === 'student'
              ? item.label(t)
              : `${area === 'studio' ? t.nav.studio : t.nav.admin} · ${item.label(t)}`,
          group: t.nav.goTo,
          icon: <item.icon />,
          onSelect: () => router.push(item.href),
        })),
    );
    const lessons = bundle.concepts
      .filter((c) => c.published)
      .map((c) => ({
        id: `lesson:${c.id}`,
        label: text(c.title, locale),
        group: t.nav.lessons,
        icon: <BookOpen />,
        // People remember the story ("the gate counter"), so it finds the lesson too.
        keywords: [
          c.id,
          ...(bundle.lessons[c.id] ? [text(bundle.lessons[c.id]!.story.title, locale)] : []),
        ],
        onSelect: () => router.push(routes.lesson(c.id)),
      }));
    return [...pages, ...lessons];
  }, [t, locale, router, user]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      placeholder={t.nav.commandPlaceholder}
      emptyText={t.nav.commandEmpty}
      title={t.nav.search}
    />
  );
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-subtle transition-colors hover:border-border-strong desktop:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">{t.nav.search}…</span>
        <kbd className="rounded border border-border bg-surface-2 px-1.5 text-[11px] font-medium">
          ⌘K
        </kbd>
      </button>
      <IconButton label={t.nav.search} onClick={onClick} className="desktop:hidden">
        <Search />
      </IconButton>
    </>
  );
}
