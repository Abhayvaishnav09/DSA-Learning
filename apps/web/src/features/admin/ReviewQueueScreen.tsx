'use client';

import { useApi } from '@logicpath/api-client/react';
import { DataTable, PageHeader, Segmented } from '@logicpath/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatRelative } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { QueryView } from '@/shared/ui/QueryView';
import { StatusBadge } from '../studio/StatusBadge';
import { DRAFT_STATUSES, studioStrings } from '../studio/strings';
import { adminStrings } from './strings';

type Filter = (typeof DRAFT_STATUSES)[number];

export function ReviewQueueScreen() {
  const t = useStrings(adminStrings).review;
  const studio = useStrings(studioStrings);
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>('in_review');
  const list = useApi('admin.review.list', { query: { limit: 100, status: filter } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />
      <Segmented
        label={t.filter}
        value={filter}
        onChange={setFilter}
        options={DRAFT_STATUSES.filter((s) => s !== 'draft').map((value) => ({
          value,
          label: studio.status[value],
        }))}
      />
      <QueryView query={list}>
        {(data) => (
          <DataTable
            caption={t.caption}
            rows={data.items}
            rowKey={(d) => d.id}
            empty={t.empty}
            columns={[
              {
                key: 'title',
                header: t.columns.title,
                sortValue: (d) => d.title.toLowerCase(),
                cell: (d) => (
                  <Link
                    href={routes.adminSubmission(d.id)}
                    className="font-medium text-accent hover:underline"
                    data-testid="queue-row"
                  >
                    {d.title}
                  </Link>
                ),
              },
              {
                key: 'author',
                header: t.columns.author,
                sortValue: (d) => d.authorName,
                cell: (d) => d.authorName,
              },
              {
                key: 'changes',
                header: t.columns.changes,
                sortValue: (d) => d.changeCount,
                cell: (d) => t.changes(d.changeCount),
              },
              {
                key: 'submitted',
                header: t.columns.submitted,
                sortValue: (d) => d.submittedAt ?? '',
                cell: (d) => (d.submittedAt ? formatRelative(d.submittedAt, locale) : '–'),
              },
              {
                key: 'status',
                header: t.columns.status,
                cell: (d) => <StatusBadge status={d.status} />,
              },
            ]}
          />
        )}
      </QueryView>
    </div>
  );
}
