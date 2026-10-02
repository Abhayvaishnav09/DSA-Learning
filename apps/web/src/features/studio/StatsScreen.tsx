'use client';

import { useApi } from '@logicpath/api-client/react';
import { DataTable, Field, PageHeader, ProgressBar, Select } from '@logicpath/ui';
import { useState } from 'react';
import { bundle, text } from '@/shared/content/bundle';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { BarList } from '@/shared/ui/charts/BarList';
import { QueryView } from '@/shared/ui/QueryView';
import { studioStrings } from './strings';

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function StatsScreen() {
  const t = useStrings(studioStrings).stats;
  const locale = useLocale();
  const [concept, setConcept] = useState('');
  const stats = useApi('studio.analytics.items', { query: concept ? { conceptId: concept } : {} });
  const label = (itemId: string) => {
    const item = bundle.items[itemId];
    return item ? text(item.prompt, locale) : itemId;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.intro} />
      <Field label={t.concept} className="max-w-sm">
        <Select
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          data-testid="stats-concept"
        >
          <option value="">{t.all}</option>
          {bundle.concepts
            .filter((c) => c.published)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {text(c.title, locale)}
              </option>
            ))}
        </Select>
      </Field>
      <QueryView query={stats}>
        {(data) => (
          <div className="flex flex-col gap-6" data-testid="stats-loaded">
            <BarList
              title={t.hardest}
              description={t.hardestNote}
              seriesName={t.firstTryName}
              rows={[...data.items]
                .sort((a, b) => a.firstTryRate - b.firstTryRate)
                .slice(0, 6)
                .map((i) => ({
                  id: i.itemId,
                  label: label(i.itemId),
                  value: Math.round(i.firstTryRate * 100),
                }))}
              formatValue={(v) => `${v}%`}
              columnHeaders={[t.columns.item, t.value]}
              empty={t.empty}
            />
            <DataTable
              caption={t.caption}
              rows={data.items}
              rowKey={(i) => i.itemId}
              empty={t.empty}
              columns={[
                {
                  key: 'item',
                  header: t.columns.item,
                  sortValue: (i) => i.itemId,
                  cell: (i) => <span title={i.itemId}>{label(i.itemId)}</span>,
                },
                {
                  key: 'attempts',
                  header: t.columns.attempts,
                  sortValue: (i) => i.attempts,
                  cell: (i) => i.attempts,
                },
                {
                  key: 'first',
                  header: t.columns.firstTry,
                  sortValue: (i) => i.firstTryRate,
                  cell: (i) => (
                    <div className="flex min-w-32 items-center gap-2">
                      <ProgressBar
                        value={i.firstTryRate * 100}
                        label={t.columns.firstTry}
                        className="flex-1"
                      />
                      <span className="w-10 text-right tabular-nums">
                        {percent(i.firstTryRate)}
                      </span>
                    </div>
                  ),
                },
                {
                  key: 'hints',
                  header: t.columns.hints,
                  sortValue: (i) => i.avgHints,
                  cell: (i) => i.avgHints,
                },
                {
                  key: 'seconds',
                  header: t.columns.seconds,
                  sortValue: (i) => i.avgSeconds,
                  cell: (i) => i.avgSeconds,
                },
                {
                  key: 'mistake',
                  header: t.columns.mistake,
                  cell: (i) =>
                    i.topMisconception
                      ? text(
                          bundle.misconceptions[i.topMisconception]?.title ?? {
                            en: i.topMisconception,
                            'hi-Latn': i.topMisconception,
                          },
                          locale,
                        )
                      : '–',
                },
              ]}
            />
          </div>
        )}
      </QueryView>
    </div>
  );
}
