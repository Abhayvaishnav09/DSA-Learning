'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChartCard, ChartTable } from './ChartCard';
import { columnPath, labelIndexes, nearestIndex, niceTicks } from './scale';
import { useWidth } from './useWidth';

export interface Point {
  /** What the point is for (a date, an item): shown on the axis and in the tooltip. */
  label: string;
  value: number;
}

const HEIGHT = 224;
const MARGIN = { top: 18, right: 14, bottom: 28, left: 46 };
const MAX_COLUMN = 24;

/**
 * One series over time, as a line (with a soft wash beneath) or as columns.
 * Built to the dataviz rules: thin marks, hairline recessive grid, an end-dot with a surface
 * ring, selective labels (the last value and the highest), a crosshair that snaps to the nearest
 * point, a tooltip that also opens from the keyboard, and a table twin. Text stays in ink
 * colours; only marks wear the series colour.
 */
export function TimeSeriesChart({
  title,
  description,
  seriesName,
  points,
  kind,
  max,
  stale,
  formatValue,
  formatLabel,
  columnHeaders,
}: {
  title: string;
  description?: string;
  seriesName: string;
  points: Point[];
  kind: 'line' | 'column';
  /** Fixes the top of the scale (for example 100 for a percentage). */
  max?: number;
  stale?: boolean;
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
  columnHeaders: [string, string];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const n = points.length;
  const dataMax = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(
    max ?? dataMax,
    4,
    points.every((p) => Number.isInteger(p.value)),
  );
  const top = ticks.at(-1)!;
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotH;

  const y = (value: number) => MARGIN.top + (1 - value / top) * plotH;
  // Lines sit on the points; columns sit in the middle of equal bands.
  const band = plotW / Math.max(1, n);
  const x = (i: number) =>
    kind === 'line'
      ? MARGIN.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
      : MARGIN.left + band * (i + 0.5);

  const color = 'var(--series-1)';
  const showLabelsAt = labelIndexes(n, Math.max(2, Math.floor(plotW / 72)));
  const peak =
    n > 0 ? points.reduce((best, p, i) => (p.value > points[best]!.value ? i : best), 0) : -1;
  const last = n - 1;

  const move = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left + MARGIN.left;
    setActive(
      kind === 'line'
        ? nearestIndex(px, MARGIN.left, MARGIN.left + plotW, n)
        : Math.min(n - 1, Math.max(0, Math.floor((px - MARGIN.left) / band))),
    );
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = active ?? last;
    const next =
      event.key === 'ArrowLeft'
        ? at - 1
        : event.key === 'ArrowRight'
          ? at + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  const shown = active === null ? null : points[active]!;
  const tipLeft = active === null ? 0 : x(active);
  const flip = tipLeft > width * 0.62;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const areaPath = n > 1 ? `${linePath} L${x(last)},${baseline} L${x(0)},${baseline} Z` : '';
  const barWidth = Math.min(MAX_COLUMN, band * 0.62);

  const chart =
    n === 0 ? null : (
      <div
        ref={ref}
        // A slider moves through the points with the arrow keys and announces each one.
        role="slider"
        aria-label={`${title}. ${seriesName}`}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active ?? last}
        aria-valuetext={`${formatLabel(points[active ?? last]!.label)}: ${formatValue(points[active ?? last]!.value)} ${seriesName}`}
        tabIndex={0}
        onKeyDown={keys}
        onFocus={() => setActive((a) => a ?? last)}
        onBlur={() => setActive(null)}
        className="relative rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <svg
          width={width}
          height={HEIGHT}
          aria-hidden
          className="block select-none"
          data-testid="chart-svg"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                style={{ stroke: tick === 0 ? 'var(--border-strong)' : 'var(--border)' }}
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-[var(--muted)] text-[11px]"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {showLabelsAt.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor={
                k === 0 && kind === 'line'
                  ? 'start'
                  : i === last && kind === 'line'
                    ? 'end'
                    : 'middle'
              }
              className="fill-[var(--muted)] text-[11px]"
            >
              {formatLabel(points[i]!.label)}
            </text>
          ))}

          {kind === 'line' ? (
            <>
              {areaPath && <path d={areaPath} style={{ fill: color }} opacity={0.1} />}
              <path
                d={linePath}
                fill="none"
                style={{ stroke: color }}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="forced-colors:stroke-[CanvasText]"
              />
            </>
          ) : (
            points.map((p, i) => (
              <path
                key={p.label}
                d={columnPath(x(i) - barWidth / 2, barWidth, baseline, y(p.value))}
                style={{ fill: color }}
                opacity={active === null || active === i ? 1 : 0.45}
                className="forced-colors:fill-[CanvasText]"
              />
            ))
          )}

          {kind === 'line' && active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={MARGIN.top}
              y2={baseline}
              style={{ stroke: 'var(--border-strong)' }}
              strokeWidth={1}
            />
          )}

          {/* End-dot: a surface-coloured ring first, so the dot stays legible over the line. */}
          {kind === 'line' &&
            [last, ...(active !== null && active !== last ? [active] : [])].map((i) => (
              <g key={i}>
                <circle
                  cx={x(i)}
                  cy={y(points[i]!.value)}
                  r={6}
                  style={{ fill: 'var(--surface)' }}
                />
                <circle cx={x(i)} cy={y(points[i]!.value)} r={4} style={{ fill: color }} />
              </g>
            ))}

          {/* Selective labels: the latest value, and the highest if it is somewhere else. */}
          {[...new Set([last, peak])]
            .filter(
              (i) =>
                i >= 0 &&
                (i === last ||
                  Math.abs(i - last) * (kind === 'line' ? plotW / Math.max(1, n - 1) : band) > 44),
            )
            .map((i) => (
              <text
                key={i}
                x={Math.min(width - MARGIN.right, Math.max(MARGIN.left + 12, x(i)))}
                y={y(points[i]!.value) - (kind === 'line' ? 12 : 6)}
                textAnchor="middle"
                className="fill-[var(--fg)] text-[11px] font-semibold"
                data-testid={i === last ? 'chart-last-label' : 'chart-peak-label'}
              >
                {formatValue(points[i]!.value)}
              </text>
            ))}

          {/* The whole plot is the hit target, much bigger than any mark. */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={move}
            onPointerLeave={() => setActive(null)}
          />
        </svg>

        {shown && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-floating"
            style={{
              top: MARGIN.top - 4,
              left: tipLeft,
              transform: `translateX(${flip ? 'calc(-100% - 12px)' : '12px'})`,
            }}
            data-testid="chart-tooltip"
          >
            <p className="text-xs text-muted">{formatLabel(shown.label)}</p>
            <p className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ background: color }}
              />
              <span className="font-semibold tabular-nums">{formatValue(shown.value)}</span>
              <span className="text-muted">{seriesName}</span>
            </p>
          </div>
        )}
      </div>
    );

  return (
    <ChartCard
      title={title}
      {...(description ? { description } : {})}
      {...(stale === undefined ? {} : { stale })}
      chart={chart ?? <div ref={ref} className="h-24" />}
      table={
        <ChartTable
          caption={`${title}. ${seriesName}`}
          columns={columnHeaders}
          rows={points.map((p) => ({ label: formatLabel(p.label), value: formatValue(p.value) }))}
        />
      }
    />
  );
}
