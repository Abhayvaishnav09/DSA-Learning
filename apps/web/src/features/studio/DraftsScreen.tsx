'use client';

import { useApi } from '@logicpath/api-client/react';
import { Button, DataTable, PageHeader, Segmented } from '@logicpath/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatRelative } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';
import { StatusBadge } from './StatusBadge';
import { DRAFT_STATUSES, studioStrings } from './strings';

type Filter = (typeof DRAFT_STATUSES)[number] | 'all';

export function DraftsScreen() {
  const t = useStrings(studioStrings);
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const drafts = useApi('studio.drafts.list', {
    query: { limit: 100, ...(filter === 'all' ? {} : { status: filter }) },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.drafts.title}
        actions={
          <Button asChild leftIcon={<Plus />}>
            <Link href={routes.newDraft}>{t.home.newDraft}</Link>
          </Button>
        }
      />
      <Segmented
        label={t.drafts.filter}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t.statusAll },
          ...DRAFT_STATUSES.map((value) => ({ value, label: t.status[value] })),
        ]}
      />
      <QueryView query={drafts}>
        {(data) => (
          <DataTable
            caption={t.drafts.caption}
            rows={data.items}
            rowKey={(d) => d.id}
            empty={t.drafts.empty}
            columns={[
              {
                key: 'title',
                header: t.drafts.columns.title,
                sortValue: (d) => d.title.toLowerCase(),
                cell: (d) => (
                  <Link
                    href={routes.draft(d.id)}
                    className="font-medium text-accent hover:underline"
                  >
                    {d.title}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: t.drafts.columns.status,
                sortValue: (d) => d.status,
                cell: (d) => <StatusBadge status={d.status} />,
              },
              {
                key: 'changes',
                header: t.drafts.columns.changes,
                sortValue: (d) => d.changeCount,
                cell: (d) => t.drafts.changes(d.changeCount),
              },
              {
                key: 'updated',
                header: t.drafts.columns.updated,
                sortValue: (d) => d.updatedAt,
                cell: (d) => formatRelative(d.updatedAt, locale),
              },
            ]}
          />
        )}
      </QueryView>
    </div>
  );
}
