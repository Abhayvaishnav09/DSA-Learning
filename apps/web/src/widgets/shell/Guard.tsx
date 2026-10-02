'use client';

import { Button, EmptyState, Spinner } from '@logicpath/ui';
import { Lock, LogIn } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { matchRoute } from '@/shared/routing/table';
import { routes } from '@/shared/routing/routes';
import { hasRole, useSession } from '@/shared/session/store';

/**
 * Applies the route table's access rule to the current page. The server-side proxy already
 * redirected signed-out visitors where it could; this covers the rest (expired sessions, the
 * demo build) and role checks. The API enforces everything again.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { status, user } = useSession();
  const access = matchRoute(pathname)?.row.access ?? 'public';

  if (access === 'public' || access === 'guest') return children;
  if (!hydrated || status === 'unknown') {
    return (
      <div className="grid min-h-[40dvh] place-items-center">
        <Spinner label={t.loading} />
      </div>
    );
  }
  if (!user) {
    return (
      <EmptyState
        className="mt-8"
        icon={<LogIn />}
        title={t.shell.signInTitle}
        description={t.shell.signInBody}
        action={
          <Button asChild>
            <Link href={routes.login(pathname)}>{t.nav.signIn}</Link>
          </Button>
        }
      />
    );
  }
  const needs = access === 'user' ? 'student' : access;
  if (!hasRole(user, needs)) {
    return (
      <EmptyState
        className="mt-8"
        icon={<Lock />}
        title={t.shell.forbiddenTitle}
        description={t.shell.forbiddenBody}
        action={
          <Button asChild variant="secondary">
            <Link href={routes.home}>{t.shell.goHome}</Link>
          </Button>
        }
      />
    );
  }
  return children;
}
