import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Skeleton } from './Feedback';

/** A headline number with an optional trend and sparkline. */
export function Stat({
  label,
  value,
  hint,
  trend,
  icon,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Change versus the previous period, e.g. +12 (%). */
  trend?: number;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-raised',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {icon && (
          <span className="text-subtle [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {trend !== undefined && (
          <span
            className={cn('text-xs font-semibold', trend >= 0 ? 'text-success' : 'text-danger')}
          >
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

/** Tiny line chart for trends; decorative, so the number next to it must say the same thing. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const line = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x!.toFixed(1)},${y!.toFixed(1)}`)
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('text-accent', className)}
      aria-hidden
    >
      <path d={`${line} L${width},${height} L0,${height} Z`} className="fill-current opacity-10" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

/**
 * Accessible table for admin lists: sortable headers (aria-sort), loading skeleton, empty
 * state, and horizontal scroll on small screens instead of squashing columns.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  loading?: boolean;
  /** Shown when there are no rows. Put links in cells to make rows navigable. */
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort?.key);
    if (!sort || !column?.sortValue) return rows;
    const value = column.sortValue;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? order : -order;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );

  return (
    // Focusable so keyboard users can scroll wide tables sideways (WCAG 2.1.1).
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-raised"
    >
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cn('px-4 py-3 font-semibold', c.className)}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase hover:text-fg"
                      onClick={() => toggle(c.key)}
                    >
                      {c.header}
                      {active ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-2/50"
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && <div className="p-6">{empty}</div>}
    </div>
  );
}
