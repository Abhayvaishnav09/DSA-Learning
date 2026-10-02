'use client';

import { keepPreviousData, useApi } from '@logicpath/api-client/react';
import { Callout, PageHeader, Segmented, Skeleton, Stat } from '@logicpath/ui';
import { Stagger, StaggerItem } from '@logicpath/ui/motion';
import Link from 'next/link';
import { useState } from 'react';
import { API_MODE } from '@/shared/api/client';
import { bundle, text } from '@/shared/content/bundle';
import { useLocale, useStrings } from '@/shared/i18n/useT';
import { formatNumber } from '@/shared/lib/format';
import { routes } from '@/shared/routing/routes';
import { BarList } from '@/shared/ui/charts/BarList';
import { compact } from '@/shared/ui/charts/scale';
import { TimeSeriesChart } from '@/shared/ui/charts/TimeSeriesChart';
import { QueryView } from '@/shared/ui/QueryView';
import { adminStrings } from './strings';

const RANGES = [7, 14, 30, 90] as const;

export function OverviewScreen() {
  const t = useStrings(adminStrings).overview;
  const locale = useLocale();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  // Changing the range keeps the old charts on screen (dimmed) until the new numbers arrive.
  const overview = useApi(
    'admin.analytics.overview',
    { query: { days } },
    { placeholderData: keepPreviousData },
  );
  const queue = useApi('admin.review.list', { query: { limit: 100 } });
  const manifest = useApi('content.manifest');

  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'hi-Latn' ? 'en-IN' : 'en', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${iso}T00:00:00`));
  const int = (n: number) =>
    n >= 10_000
      ? compact(n, locale === 'hi-Latn' ? 'en-IN' : 'en')
      : formatNumber(Math.round(n), locale);
  const misconceptionName = (id: string) => {
    const m = bundle.misconceptions[id];
    return m ? text(m.title, locale) : id;
  };
  const itemName = (id: string) => {
    const item = bundle.items[id];
    return item ? text(item.prompt, locale) : id;
  };

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <PageHeader title={t.title} description={t.intro} />
      </StaggerItem>

      {/* One row of filters above everything it scopes. */}
      <StaggerItem>
        <Segmented
          label={t.range}
          value={String(days) as `${(typeof RANGES)[number]}`}
          onChange={(v) => setDays(Number(v) as (typeof RANGES)[number])}
          options={RANGES.map((n) => ({ value: String(n) as `${typeof n}`, label: t.days(n) }))}
        />
      </StaggerItem>

      <StaggerItem>
        <QueryView query={overview} skeleton={<OverviewSkeleton />}>
          {(data) => (
            <div className="flex flex-col gap-6" data-testid="overview-loaded">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Stat label={t.activeDay} value={data.activeUsers.day} hint={t.activeNote} />
                <Stat label={t.activeWeek} value={data.activeUsers.week} />
                <Stat label={t.activeMonth} value={data.activeUsers.month} />
                <Stat label={t.pending} value={queue.data ? queue.data.items.length : '…'}>
                  <Link
                    href={routes.adminReview}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {t.pendingOpen}
                  </Link>
                </Stat>
                <Stat
                  label={t.live}
                  value={manifest.data ? `v${manifest.data.number}` : '…'}
                  hint={
                    manifest.data
                      ? t.liveBody(manifest.data.number, manifest.data.items)
                      : undefined
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TimeSeriesChart
                  title={t.attempts}
                  seriesName={t.attemptsSeries}
                  kind="column"
                  stale={overview.isPlaceholderData}
                  points={data.attempts.map((d) => ({ label: d.date, value: d.value }))}
                  formatValue={int}
                  formatLabel={shortDate}
                  columnHeaders={[t.date, t.attemptsSeries]}
                />
                <TimeSeriesChart
                  title={t.correct}
                  description={t.correctNote}
                  seriesName={t.correctSeries}
                  kind="line"
                  max={100}
                  stale={overview.isPlaceholderData}
                  points={data.correctRate.map((d) => ({ label: d.date, value: d.value }))}
                  formatValue={(v) => `${Math.round(v)}%`}
                  formatLabel={shortDate}
                  columnHeaders={[t.date, t.correctSeries]}
                />
                <TimeSeriesChart
                  title={t.signups}
                  seriesName={t.signupsSeries}
                  kind="column"
                  stale={overview.isPlaceholderData}
                  points={data.signups.map((d) => ({ label: d.date, value: d.value }))}
                  formatValue={int}
                  formatLabel={shortDate}
                  columnHeaders={[t.date, t.signupsSeries]}
                />
                <TimeSeriesChart
                  title={t.lessons}
                  seriesName={t.lessonsSeries}
                  kind="column"
                  stale={overview.isPlaceholderData}
                  points={data.lessonsCompleted.map((d) => ({ label: d.date, value: d.value }))}
                  formatValue={int}
                  formatLabel={shortDate}
                  columnHeaders={[t.date, t.lessonsSeries]}
                />
                <BarList
                  title={t.mistakes}
                  description={t.mistakesNote}
                  seriesName={t.mistakesSeries}
                  stale={overview.isPlaceholderData}
                  rows={data.topMisconceptions.map((m) => ({
                    id: m.id,
                    label: misconceptionName(m.id),
                    value: m.count,
                  }))}
                  formatValue={int}
                  columnHeaders={[t.name, t.count]}
                  empty={t.mistakesEmpty}
                />
                <BarList
                  title={t.hardest}
                  description={t.hardestNote}
                  seriesName={t.hardestSeries}
                  stale={overview.isPlaceholderData}
                  rows={data.hardestItems.map((i) => ({
                    id: i.itemId,
                    label: itemName(i.itemId),
                    value: Math.round(i.firstTryRate * 100),
                  }))}
                  formatValue={(v) => `${v}%`}
                  columnHeaders={[t.name, t.value]}
                  empty={t.hardestEmpty}
                />
              </div>
              {API_MODE === 'local' && <Callout tone="info">{t.demoNote}</Callout>}
            </div>
          )}
        </QueryView>
      </StaggerItem>
    </Stagger>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="overview-loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}
