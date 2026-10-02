'use client';

import { ChartCard, ChartTable } from './ChartCard';
import { barPath } from './scale';
import { useWidth } from './useWidth';

export interface BarRow {
  id: string;
  /** The category name, in ink colour: the colour belongs to the bar, not the words. */
  label: string;
  value: number;
}

const ROW = 30;
const BAR = 14;
const NAME_COLUMN = 0.38;

/**
 * Horizontal bars for nominal categories (the most common mistakes, the hardest questions).
 * Every bar takes the same single series colour, because bar length already carries the value;
 * the number sits at the tip, or inside the plot's end if the bar would leave no room for it.
 */
export function BarList({
  title,
  description,
  seriesName,
  rows,
  stale,
  formatValue,
  columnHeaders,
  empty,
}: {
  title: string;
  description?: string;
  seriesName: string;
  rows: BarRow[];
  stale?: boolean;
  formatValue: (value: number) => string;
  columnHeaders: [string, string];
  empty: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const nameW = Math.min(220, Math.round(width * NAME_COLUMN));
  const valueW = 48;
  const plotW = Math.max(40, width - nameW - valueW);

  const chart =
    rows.length === 0 ? (
      <p ref={ref as never} className="py-6 text-center text-sm text-muted">
        {empty}
      </p>
    ) : (
      <div ref={ref}>
        <ul className="flex flex-col" aria-label={`${title}. ${seriesName}`}>
          {rows.map((row) => {
            const length = Math.max(2, (row.value / max) * plotW);
            return (
              <li key={row.id} className="group flex items-center" style={{ height: ROW }}>
                <span
                  className="truncate pr-3 text-sm text-muted"
                  style={{ width: nameW }}
                  title={row.label}
                >
                  {row.label}
                </span>
                <svg width={plotW} height={ROW} aria-hidden className="shrink-0">
                  <path
                    d={barPath(0, (ROW - BAR) / 2, BAR, length)}
                    style={{ fill: 'var(--series-1)' }}
                    className="transition-opacity group-hover:opacity-80 forced-colors:fill-[CanvasText]"
                  />
                </svg>
                <span className="w-12 pl-2 text-sm font-semibold tabular-nums">
                  {formatValue(row.value)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <ChartCard
      title={title}
      {...(description ? { description } : {})}
      {...(stale === undefined ? {} : { stale })}
      chart={chart}
      table={
        <ChartTable
          caption={`${title}. ${seriesName}`}
          columns={columnHeaders}
          rows={rows.map((r) => ({ label: r.label, value: formatValue(r.value) }))}
        />
      }
    />
  );
}
