'use client';

import { Card, IconButton } from '@logicpath/ui';
import { Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT } from '@/shared/i18n/useT';

/**
 * The frame every chart sits in: a title that names what is plotted (so a single series needs
 * no legend box), an optional note, and a switch to the same numbers as a table (the accessible
 * twin of the picture). While new data loads, the previous drawing stays, dimmed, so nothing jumps.
 */
export function ChartCard({
  title,
  description,
  stale = false,
  chart,
  table,
  className,
}: {
  title: string;
  description?: string;
  stale?: boolean;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const t = useT().s.charts;
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={`min-w-0 ${className ?? ''}`} data-testid={`chart-${title}`}>
      <figure className="flex flex-col gap-3">
        <figcaption className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <IconButton
            label={showTable ? t.showChart : t.showTable}
            size="icon-sm"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
          >
            <Table2 />
          </IconButton>
        </figcaption>
        <div className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {showTable ? table : chart}
        </div>
      </figure>
    </Card>
  );
}

/** The table twin: every value the picture shows, as plain, labelled cells. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: [string, string];
  rows: { label: string; value: string }[];
}) {
  return (
    // Focusable so keyboard users can scroll a long table.
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className="max-h-72 overflow-auto rounded-xl border border-border"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              {columns[0]}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              {columns[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border">
              <th scope="row" className="px-3 py-1.5 font-normal text-muted">
                {row.label}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
