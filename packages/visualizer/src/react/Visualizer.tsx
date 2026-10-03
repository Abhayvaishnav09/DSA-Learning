import { useEffect, useMemo, type KeyboardEvent } from 'react';
import type { Locale } from '../engine';
import {
  boxKey,
  viewPseudocode,
  viewText,
  type CellMark,
  type ViewFrame,
  type ViewValue,
} from '../view';
import { LABELS, type VisualizerLabels } from './labels';
import { SPEEDS_MS, usePlayer } from './usePlayer';

export interface VisualizerProps {
  /** The program text. Run as pseudocode unless `frames` are given. */
  source: string;
  /** A trace made elsewhere (real Python); `source` is then only shown. */
  frames?: ViewFrame[];
  locale: Locale;
  /** Author-written captions that replace the automatic ones, by frame index. */
  captions?: Readonly<Record<number, string>>;
  /** The learner can't step past this frame (used by the predict beat). */
  limit?: number;
  autoPlay?: boolean;
  onFrameChange?: (frame: ViewFrame, isLast: boolean) => void;
  /** Show text values in quotes, so "5" and 5 look different (real languages). */
  quoteText?: boolean;
  className?: string;
}

/**
 * Step-by-step program player (docs/03-frontend.md §6).
 * Every visual has a text caption, so screen readers and slow connections get the same lesson.
 */
export function Visualizer({
  source,
  frames: given,
  locale,
  captions,
  limit,
  autoPlay = false,
  onFrameChange,
  quoteText = false,
  className = '',
}: VisualizerProps) {
  const frames = useMemo(() => given ?? viewPseudocode(source), [given, source]);
  const lines = useMemo(() => source.replace(/\n+$/, '').split('\n'), [source]);
  const player = usePlayer({ count: frames.length, limit, autoPlay });
  const frame = frames[player.index]!;
  const labels = LABELS[locale];
  const text = captions?.[frame.index] ?? frame.caption[locale];
  const quote = quoteText;
  const totalChecks = frames.at(-1)!.checks;

  useEffect(() => {
    onFrameChange?.(frame, frame.index === frames.length - 1);
  }, [frame, frames.length, onFrameChange]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') player.next();
    else if (event.key === 'ArrowLeft') player.prev();
    else if (event.key === 'Home') player.restart();
    else if (event.key === 'End') player.goTo(player.last);
    else if (event.key === ' ') {
      if (player.playing) player.pause();
      else player.play();
    } else return;
    event.preventDefault();
  };

  // Every top-level box that ever exists, in the order it first appears.
  const varNames = useMemo(
    () => [...new Set(frames.flatMap((f) => f.globals.map((b) => b.name)))],
    [frames],
  );
  const current = frame.stack.length - 1;
  const changedAt = (depth: number) => (frame.changed?.depth === depth ? frame.changed.name : null);

  // The player is one focusable region with arrow-key and space shortcuts (like a media
  // player); every shortcut also has a visible button, so nothing is keyboard-only.
  /* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */
  return (
    <section
      className={`lp-viz rounded-2xl border border-border bg-surface p-3 sm:p-4 ${className}`}
      aria-label={labels.region}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="visualizer"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ol
          className="lp-code self-start overflow-x-auto rounded-xl bg-code py-3 font-mono text-sm leading-7"
          aria-label={labels.code}
          tabIndex={0}
        >
          {lines.map((line, i) => {
            const active = frame.line === i + 1;
            const failed = active && frame.error !== undefined;
            return (
              <li
                key={i}
                className={`flex gap-2 border-l-4 px-2 ${
                  failed
                    ? 'lp-active border-danger bg-danger-soft font-semibold text-fg'
                    : active
                      ? 'lp-active border-accent bg-accent/15 font-semibold text-fg'
                      : 'border-transparent text-muted'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                <span className="w-4 shrink-0 text-accent" aria-hidden>
                  {active ? (failed ? '✖' : '▶') : ''}
                </span>
                <span className="w-6 shrink-0 select-none text-right" aria-hidden>
                  {i + 1}
                </span>
                <span className="whitespace-pre">{line || ' '}</span>
              </li>
            );
          })}
        </ol>

        <div className="flex min-w-0 flex-col gap-3">
          <div
            className={`rounded-xl border p-3 ${frame.error ? 'border-danger bg-danger-soft' : 'border-accent/40 bg-bg'}`}
          >
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.now}
            </h3>
            <p className="min-h-12 text-base" aria-live="polite" data-testid="viz-caption">
              {text}
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.boxes}
            </h3>
            <BoxList
              testId="viz-vars"
              boxes={varNames.map((name) => ({
                name,
                value: frame.globals.find((b) => b.name === name)?.value,
              }))}
              depth={-1}
              frame={frame}
              changed={changedAt(-1)}
              labels={labels}
              quote={quote}
            />
          </div>

          {frame.stack.length > 0 && (
            <div data-testid="viz-stack">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {labels.calls}
              </h3>
              <ol className="flex flex-col gap-2">
                {frame.stack.map((call, depth) => (
                  <li
                    key={depth}
                    className={`lp-push rounded-xl border-2 p-2 ${depth === current ? 'border-accent' : 'border-dashed border-border opacity-70'}`}
                    aria-current={depth === current ? 'step' : undefined}
                  >
                    <div className="mb-1 font-mono text-xs font-semibold text-accent">
                      {call.name}( )
                    </div>
                    <BoxList
                      boxes={call.boxes}
                      depth={depth}
                      frame={frame}
                      changed={changedAt(depth)}
                      labels={labels}
                      quote={quote}
                    />
                  </li>
                ))}
              </ol>
            </div>
          )}

          {totalChecks > 0 && (
            <div data-testid="viz-checks">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {labels.checks}
              </h3>
              <div className="mb-1 font-mono text-sm tabular-nums">
                {labels.checksCount(frame.checks, totalChecks)}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-border" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${(frame.checks / totalChecks) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.screen}
            </h3>
            <output
              className="block min-h-16 overflow-x-auto rounded-xl bg-code p-2 font-mono text-sm"
              aria-label={labels.screen}
              data-testid="viz-output"
            >
              {frame.output.length === 0 ? (
                <span className="text-muted">{labels.emptyScreen}</span>
              ) : (
                frame.output.map((out, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre ${i === frame.output.length - 1 && frame.printed ? 'lp-pop' : ''}`}
                  >
                    {out}
                  </div>
                ))
              )}
            </output>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="lp-btn-icon"
          onClick={player.restart}
          aria-label={labels.restart}
        >
          ⏮
        </button>
        <button
          type="button"
          className="lp-btn-icon"
          onClick={player.prev}
          disabled={player.index === 0}
          aria-label={labels.back}
        >
          ◀
        </button>
        <button
          type="button"
          className="lp-btn-icon lp-btn-play"
          onClick={player.playing ? player.pause : player.play}
          disabled={player.atEnd && player.last < frames.length - 1}
          aria-label={player.playing ? labels.pause : labels.play}
        >
          {player.playing ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="lp-btn-icon"
          onClick={player.next}
          disabled={player.atEnd}
          aria-label={labels.forward}
        >
          ▶|
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          {labels.speed}
          <select
            className="rounded-lg border border-border bg-bg px-2 py-1 text-fg"
            value={player.speedMs}
            onChange={(e) => player.setSpeedMs(Number(e.target.value))}
          >
            {SPEEDS_MS.map((ms, i) => (
              <option key={ms} value={ms}>
                {labels.speeds[i]}
              </option>
            ))}
          </select>
        </label>
        <span className="w-full text-xs text-muted sm:w-auto" data-testid="viz-step">
          {labels.step(player.index + 1, frames.length)}
        </span>
      </div>
    </section>
  );
  /* eslint-enable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */
}

interface BoxListProps {
  boxes: { name: string; value: ViewValue | undefined }[];
  depth: number;
  frame: ViewFrame;
  changed: string | null;
  labels: VisualizerLabels;
  quote: boolean;
  testId?: string;
}

const CELL_STYLE: Record<NonNullable<CellMark['state']> | 'seen' | 'plain', string> = {
  current: 'border-accent bg-accent-soft -translate-y-1',
  miss: 'border-danger bg-danger-soft -translate-y-1',
  found: 'border-success bg-success-soft -translate-y-1',
  seen: 'border-border bg-bg text-muted line-through',
  plain: 'border-border bg-surface',
};

/** Variables as labelled boxes; lists as a strip of numbered cells (the find_paper look). */
function BoxList({ boxes, depth, frame, changed, labels, quote, testId }: BoxListProps) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid={testId}>
      {boxes.map(({ name, value }) => {
        const isChanged = changed === name;
        if (value?.kind === 'seq') {
          const marks = frame.marks[boxKey(depth, name)] ?? {};
          return (
            <li
              key={name}
              className={`max-w-full rounded-xl border-2 px-2 py-1 ${isChanged ? 'border-accent bg-accent-soft' : 'border-border'}`}
            >
              <div className="font-mono text-xs text-muted">
                {name}
                {value.type !== 'list' && <span className="ml-1 opacity-70">({value.type})</span>}
              </div>
              <ol
                className="flex flex-wrap gap-1 pt-1"
                aria-label={`${name}: ${viewText(value, true)}`}
              >
                {value.items.length === 0 && (
                  <li className="px-2 font-mono text-sm text-muted">[ ]</li>
                )}
                {value.items.map((item, i) => {
                  const mark = marks[i];
                  const style = mark?.state ?? (mark?.seen ? 'seen' : 'plain');
                  const tag =
                    mark?.state === 'found'
                      ? labels.found
                      : mark?.state === 'miss'
                        ? `≠ ${mark.pointers?.join(', ') ?? ''}`
                        : (mark?.pointers?.join(', ') ?? '');
                  const state =
                    mark?.state === 'found'
                      ? labels.found
                      : mark?.state === 'miss'
                        ? labels.miss
                        : mark?.seen
                          ? labels.seen
                          : null;
                  return (
                    <li key={i} className="lp-slide flex flex-col items-center">
                      <span
                        key={viewText(item, true)}
                        className={`min-w-9 rounded-md border-2 px-1.5 py-0.5 text-center font-mono text-base font-bold transition-all duration-200 ${CELL_STYLE[style]} ${
                          isChanged && frame.changedIndex === i ? 'lp-pop' : ''
                        }`}
                      >
                        {viewText(item, quote)}
                        {state && <span className="sr-only"> ({state})</span>}
                      </span>
                      <span className="font-mono text-[10px] text-muted" aria-hidden>
                        {i}
                      </span>
                      <span
                        className={`min-h-4 font-mono text-[11px] font-semibold leading-4 ${
                          mark?.state === 'found'
                            ? 'text-success'
                            : mark?.state === 'miss'
                              ? 'text-danger'
                              : 'text-accent'
                        }`}
                        aria-hidden
                      >
                        {tag}
                      </span>
                    </li>
                  );
                })}
                {value.more ? (
                  <li className="self-center px-1 font-mono text-xs text-muted">
                    {labels.more(value.more)}
                  </li>
                ) : null}
              </ol>
            </li>
          );
        }
        if (value?.kind === 'dict') {
          return (
            <li
              key={name}
              className={`max-w-full rounded-xl border-2 px-2 py-1 ${isChanged ? 'border-accent bg-accent-soft' : 'border-border'}`}
            >
              <div className="font-mono text-xs text-muted">
                {name}
                {value.label && <span className="ml-1 opacity-70">({value.label})</span>}
              </div>
              <dl
                className="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-sm"
                aria-label={`${name}: ${viewText(value, true)}`}
              >
                {value.entries.map(([k, v], i) => (
                  <div key={i} className="contents">
                    <dt className="text-muted">{viewText(k, quote && !value.label)}</dt>
                    <dd className="font-bold break-all">{viewText(v, quote)}</dd>
                  </div>
                ))}
                {value.more ? (
                  <div className="col-span-2 text-xs text-muted">{labels.more(value.more)}</div>
                ) : null}
              </dl>
            </li>
          );
        }
        return (
          <li
            key={name}
            className={`min-w-16 max-w-full rounded-xl border-2 px-3 py-1 text-center transition-colors ${
              isChanged ? 'border-accent bg-accent-soft' : 'border-border'
            } ${value === undefined ? 'border-dashed' : ''}`}
          >
            <div className="font-mono text-xs text-muted">{name}</div>
            <div
              key={value === undefined ? '-' : viewText(value, true)}
              className={`font-mono text-xl font-bold break-all ${isChanged ? 'lp-pop' : ''}`}
            >
              {value === undefined ? '–' : viewText(value, quote)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
