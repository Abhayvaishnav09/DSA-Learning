'use client';

import { Button, EmptyState, PageHeader } from '@logicpath/ui';
import { Hammer } from 'lucide-react';
import Link from 'next/link';
import type { Messages } from '@/shared/i18n/messages';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

/** Holds a route's place in the app (shell, guard, nav, title) until its screen ships. */
export function ComingSoon({ title }: { title: keyof Messages['nav'] }) {
  const t = useT();
  const heading = t.nav[title];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={typeof heading === 'string' ? heading : ''} />
      <EmptyState
        icon={<Hammer />}
        title={t.shell.comingTitle}
        description={t.shell.comingBody}
        action={
          <Button asChild variant="secondary">
            <Link href={routes.learn}>{t.shell.goHome}</Link>
          </Button>
        }
      />
    </div>
  );
}
