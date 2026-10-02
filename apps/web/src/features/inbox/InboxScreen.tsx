'use client';

import { useApi, useApiMutation } from '@logicpath/api-client/react';
import type { engagement } from '@logicpath/contracts';
import { Badge, Button, EmptyState, PageHeader } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import { Award, Bell, BookCheck, Mail, Repeat, TrendingUp, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useT } from '@/shared/i18n/useT';
import { formatRelative } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';

const ICON: Record<engagement.Notification['kind'], LucideIcon> = {
  review_due: Repeat,
  badge: Award,
  level_up: TrendingUp,
  league: Trophy,
  class: Users,
  submission: BookCheck,
  system: Mail,
};

export function InboxScreen() {
  const t = useT().s.inbox;
  const locale = useLocale();
  const list = useApi('notifications.list', { query: {} });
  const read = useApiMutation('notifications.read', {
    invalidates: ['notifications.list', 'home'],
  });
  const readAll = useApiMutation('notifications.readAll', {
    invalidates: ['notifications.list', 'home'],
  });

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <PageHeader
          title={t.title}
          actions={
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={routes.settings}>{t.preferences}</Link>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={readAll.isPending}
                disabled={!list.data || list.data.unreadCount === 0}
                onClick={() => readAll.mutate({})}
                data-testid="mark-all"
              >
                {t.markAll}
              </Button>
            </>
          }
        />
      </StaggerItem>
      <StaggerItem>
        <QueryView query={list}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon={<Bell />} title={t.empty} description={t.emptyBody} />
            ) : (
              <ul className="flex flex-col gap-2" data-testid="inbox-list">
                {data.items.map((note) => {
                  const Icon = ICON[note.kind];
                  const unread = note.readAt === null;
                  return (
                    <li key={note.id}>
                      <div
                        className={`flex items-start gap-3 rounded-2xl border p-4 ${unread ? 'border-accent/40 bg-accent-soft/40' : 'border-border bg-surface'}`}
                        data-unread={unread}
                      >
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <div className="flex flex-1 flex-col gap-1">
                          <p className="flex flex-wrap items-center gap-2 font-semibold">
                            {note.title}
                            {unread && <Badge tone="accent">{t.unread}</Badge>}
                          </p>
                          <p className="text-sm text-muted">{note.body}</p>
                          <p className="text-xs text-subtle">
                            {formatRelative(note.createdAt, locale)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {note.link && (
                            <Button asChild size="sm" variant="secondary">
                              <Link
                                href={note.link as never}
                                onClick={() => unread && read.mutate({ params: { id: note.id } })}
                              >
                                {t.open}
                              </Link>
                            </Button>
                          )}
                          {unread && !note.link && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => read.mutate({ params: { id: note.id } })}
                            >
                              ✓
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryView>
      </StaggerItem>
    </Stagger>
  );
}
