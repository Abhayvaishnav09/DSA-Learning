import type { Role } from '@logicpath/contracts';
import {
  BarChart3,
  BookOpen,
  FilePlus2,
  FileText,
  Flag,
  History,
  Home,
  Image,
  Inbox,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Repeat2,
  ScrollText,
  School,
  Search,
  Settings,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import type { Messages } from '@/shared/i18n/messages';
import { routes } from '@/shared/routing/routes';

export type Area = 'student' | 'studio' | 'admin';

export interface NavItem {
  href: string;
  label: (t: Messages) => string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar (at most 5 per area). */
  primary?: boolean;
  /** Only for signed-in users. */
  signedIn?: boolean;
}

export const AREA_NAV: Record<Area, NavItem[]> = {
  student: [
    { href: routes.home, label: (t) => t.nav.dashboard, icon: Home, primary: true },
    { href: routes.learn, label: (t) => t.nav.learn, icon: BookOpen, primary: true },
    { href: routes.review, label: (t) => t.nav.review, icon: Repeat2, primary: true },
    {
      href: routes.leaderboard,
      label: (t) => t.nav.leagues,
      icon: Trophy,
      primary: true,
      signedIn: true,
    },
    { href: routes.classes, label: (t) => t.nav.classes, icon: School, signedIn: true },
    { href: routes.search(), label: (t) => t.nav.search, icon: Search },
    {
      href: routes.profile,
      label: (t) => t.nav.profile,
      icon: User,
      primary: true,
      signedIn: true,
    },
    { href: routes.settings, label: (t) => t.nav.settings, icon: Settings },
  ],
  studio: [
    { href: routes.studio, label: (t) => t.nav.overview, icon: LayoutDashboard, primary: true },
    { href: routes.drafts, label: (t) => t.nav.drafts, icon: FileText, primary: true },
    { href: routes.newDraft, label: (t) => t.nav.newDraft, icon: FilePlus2, primary: true },
    { href: routes.studioMedia, label: (t) => t.nav.media, icon: Image, primary: true },
    { href: routes.studioStats, label: (t) => t.nav.stats, icon: BarChart3, primary: true },
  ],
  admin: [
    { href: routes.admin, label: (t) => t.nav.overview, icon: LayoutDashboard, primary: true },
    { href: routes.adminReview, label: (t) => t.nav.reviewQueue, icon: Inbox, primary: true },
    { href: routes.adminContent, label: (t) => t.nav.content, icon: History, primary: true },
    { href: routes.adminUsers, label: (t) => t.nav.users, icon: Users, primary: true },
    { href: routes.adminClasses, label: (t) => t.nav.classes, icon: School },
    { href: routes.adminFlags, label: (t) => t.nav.flags, icon: Flag },
    { href: routes.adminApiKeys, label: (t) => t.nav.apiKeys, icon: KeyRound },
    { href: routes.adminMedia, label: (t) => t.nav.media, icon: Image },
    { href: routes.adminAudit, label: (t) => t.nav.audit, icon: ScrollText },
  ],
};

export const AREA_HOME: Record<Area, string> = {
  student: routes.home,
  studio: routes.studio,
  admin: routes.admin,
};

export const AREA_ROLE: Record<Area, Role> = {
  student: 'student',
  studio: 'writer',
  admin: 'admin',
};

/** Is this nav item the current page? Section roots only match themselves. */
export function isActive(pathname: string, href: string): boolean {
  const path = href.split('?')[0]!;
  if (path === routes.studio || path === routes.admin || path === routes.home)
    return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}
