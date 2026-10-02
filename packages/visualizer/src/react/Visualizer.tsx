import { useEffect, useMemo, type KeyboardEvent } from 'react';
import {
  caption as autoCaption,
  formatValue,
  run,
  type Frame,
  type Locale,
  type Value,
} from '../engine';
import { LABELS } from './labels';
import { SPEEDS_MS, usePlayer } from './usePlayer';

export interface VisualizerProps {
  /** Pseudocode to run. */
  source: string;
  locale: Locale;
  /** Author-written captions that replace the automatic ones, by frame index. */
  captions?: Readonly<Record<number, string>>;
  /** The learner can't step past this frame (used by the predict beat). */
  limit?: number;
  autoPlay?: boolean;
  onFrameChange?: (frame: Frame, isLast: boolean) => void;
  className?: string;
}

/**
 * Step-by-step program player (docs/03-frontend.md §6).
 * Every visual has a text caption, so screen readers and slow connections get the same lesson.
 */
export function Visualizer({
  source,
  locale,
  captions,
  limit,
  autoPlay = false,
  onFrameChange,
  className = '',
}: VisualizerProps) {
  const frames = useMemo(() => run(source), [source]);
  const lines = useMemo(() => source.replace(/\n+$/, '').split('\n'), [source]);
  const player = usePlayer({ count: frames.length, limit, autoPlay });
  const frame = frames[player.index]!;
  const labels = LABELS[locale];
  const text = captions?.[frame.index] ?? autoCaption(frame, locale);

  useEffect(() => {
    onFrameChange?.(frame, frame.index === frames.length - 1);
  }, [frame, frames.length, onFrameChange]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') player.next();
    else if (event.key === 'ArrowLeft') player.prev();
    else if (event.key === ' ') {
      if (player.playing) player.pause();
      else player.play();
    } else return;
    event.preventDefault();
  };

  // Every top-level box that ever exists, in the order it first appears.
  const varNames = [...new Set(frames.flatMap((f) => Object.keys(f.vars)))];
  const current = frame.stack.length - 1;

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
      <div className="grid gap-3 md:grid-cols-[3fr_2fr]">
        <ol
          className="lp-code overflow-x-auto rounded-xl bg-code p-3 font-mono text-sm leading-7"
          aria-label={labels.code}
        >
          {lines.map((line, i) => {
            const active = frame.line === i + 1;
            return (
              <li
                key={i}
                className={`flex gap-2 rounded-md px-1 ${active ? 'lp-active bg-accent/15 font-semibold text-fg' : 'text-muted'}`}
                aria-current={active ? 'step' : undefined}
              >
                <span className="w-4 shrink-0 text-accent" aria-hidden>
                  {active ? '▶' : ''}
                </span>
                <span className="w-5 shrink-0 select-none text-right opacity-50" aria-hidden>
                  {i + 1}
                </span>
                <span className="whitespace-pre">{line || ' '}</span>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-3">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.boxes}
            </h3>
            <BoxList
              testId="viz-vars"
              names={varNames}
              vars={frame.vars}
              changed={current === -1 ? frame.changed : null}
              changedIndex={frame.changedIndex}
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
                      names={Object.keys(call.vars)}
                      vars={call.vars}
                      changed={depth === current ? frame.changed : null}
                      changedIndex={frame.changedIndex}
                    />
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.screen}
            </h3>
            <output
              className="block min-h-16 rounded-xl bg-code p-2 font-mono text-sm"
              aria-label={labels.screen}
              data-testid="viz-output"
            >
              {frame.output.length === 0 ? (
                <span className="text-muted">{labels.emptyScreen}</span>
              ) : (
                frame.output.map((out, i) => (
                  <div
                    key={i}
                    className={
                      i === frame.output.length - 1 && frame.event.type === 'say' ? 'lp-pop' : ''
                    }
                  >
                    {out}
                  </div>
                ))
              )}
            </output>
          </div>
        </div>
      </div>

      <p
        className="mt-3 min-h-12 rounded-xl bg-bg p-3 text-base"
        aria-live="polite"
        data-testid="viz-caption"
      >
        {text}
      </p>

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
  names: string[];
  vars: Record<string, Value>;
  changed: string | null;
  changedIndex: number | null;
  testId?: string;
}

/** Variables as labelled boxes; lists as a strip of numbered cells. */
function BoxList({ names, vars, changed, changedIndex, testId }: BoxListProps) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid={testId}>
      {names.map((name) => {
        const value = vars[name];
        const isChanged = changed === name;
        if (Array.isArray(value)) {
          return (
            <li
              key={name}
              className={`rounded-xl border-2 px-2 py-1 ${isChanged ? 'border-accent bg-accent-soft' : 'border-border'}`}
            >
              <div className="font-mono text-xs text-muted">{name}</div>
              <ol className="flex gap-1" aria-label={`${name}: ${formatValue(value)}`}>
                {value.length === 0 && <li className="px-2 font-mono text-sm text-muted">[ ]</li>}
                {value.map((item, i) => (
                  <li key={i} className="lp-slide flex flex-col items-center">
                    <span
                      key={formatValue(item)}
                      className={`min-w-9 rounded-md border px-1.5 py-0.5 text-center font-mono text-base font-bold ${
                        isChanged && changedIndex === i
                          ? 'lp-pop border-accent bg-surface'
                          : 'border-border bg-surface'
                      }`}
                    >
                      {formatValue(item)}
                    </span>
                    <span className="font-mono text-[10px] text-muted" aria-hidden>
                      {i}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          );
        }
        return (
          <li
            key={name}
            className={`min-w-16 rounded-xl border-2 px-3 py-1 text-center transition-colors ${
              isChanged ? 'border-accent bg-accent-soft' : 'border-border'
            } ${value === undefined ? 'opacity-40' : ''}`}
          >
            <div className="font-mono text-xs text-muted">{name}</div>
            <div
              key={value === undefined ? '-' : String(value)}
              className={`font-mono text-xl font-bold ${isChanged ? 'lp-pop' : ''}`}
            >
              {value === undefined ? '–' : formatValue(value)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
