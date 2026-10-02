'use client';

import { useApi } from '@logicpath/api-client/react';
import { Button, Card, CardTitle, EmptyState, PageHeader, Skeleton, Stat } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { BarChart3, Image as ImageIcon, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatRelative } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { useSession } from '@/shared/session/store';
import { StatusBadge } from './StatusBadge';
import { studioStrings } from './strings';

export function StudioHome() {
  const t = useStrings(studioStrings);
  const locale = useLocale();
  const user = useSession((s) => s.user);
  const drafts = useApi('studio.drafts.list', { query: { limit: 100 } });
  const manifest = useApi('content.manifest');
  const items = drafts.data?.items ?? [];
  const count = (status: string) => items.filter((d) => d.status === status).length;
  const needChanges = items.filter((d) => d.status === 'changes_requested');
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <PageHeader
          title={t.home.greeting(user?.name.split(' ')[0] ?? '')}
          description={t.home.subtitle}
          actions={
            <Button asChild leftIcon={<Plus />} data-testid="studio-new-draft">
              <Link href={routes.newDraft}>{t.home.newDraft}</Link>
            </Button>
          }
        />
      </StaggerItem>

      <StaggerItem className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.home.stats.total} value={drafts.data ? items.length : '…'} />
        <Stat label={t.home.stats.review} value={drafts.data ? count('in_review') : '…'} />
        <Stat label={t.home.stats.changes} value={drafts.data ? count('changes_requested') : '…'} />
        <Stat label={t.home.stats.published} value={drafts.data ? count('published') : '…'} />
      </StaggerItem>

      <StaggerItem className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 lg:col-span-2">
          <CardTitle>{t.home.attention}</CardTitle>
          {drafts.isPending ? (
            <Skeleton className="h-16" />
          ) : needChanges.length === 0 ? (
            <p className="text-sm text-muted">{t.home.attentionNone}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {needChanges.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={routes.draft(d.id)}
                    className="font-medium text-accent hover:underline"
                  >
                    {d.title}
                  </Link>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <CardTitle>{t.home.live}</CardTitle>
          {manifest.data ? (
            <p className="text-sm text-muted" data-testid="live-version">
              {t.home.liveBody(manifest.data.number, manifest.data.concepts, manifest.data.items)}
            </p>
          ) : (
            <Skeleton className="h-10" />
          )}
          <p className="mt-2 text-sm font-semibold">{t.home.quick}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary" leftIcon={<ImageIcon />}>
              <Link href={routes.studioMedia}>{t.media.title}</Link>
            </Button>
            <Button asChild size="sm" variant="secondary" leftIcon={<BarChart3 />}>
              <Link href={routes.studioStats}>{t.stats.title}</Link>
            </Button>
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <CardTitle>{t.home.recent}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={routes.drafts}>{t.home.allDrafts}</Link>
            </Button>
          </div>
          {drafts.isPending ? (
            <Skeleton className="h-24" />
          ) : recent.length === 0 ? (
            <EmptyState icon={<PenLine />} title={t.home.recentEmpty} />
          ) : (
            <ul className="flex flex-col divide-y divide-border" data-testid="recent-drafts">
              {recent.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="flex flex-col">
                    <Link href={routes.draft(d.id)} className="font-medium hover:text-accent">
                      {d.title}
                    </Link>
                    <span className="text-xs text-muted">
                      {t.home.updated(formatRelative(d.updatedAt, locale))}
                    </span>
                  </div>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
