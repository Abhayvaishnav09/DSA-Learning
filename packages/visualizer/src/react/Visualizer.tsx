import { useEffect, useMemo, type KeyboardEvent } from 'react';
import { caption as autoCaption, formatValue, run, type Frame, type Locale } from '../engine';
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

  const varNames = Object.keys(frames.at(-1)!.vars);

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
            <ul className="flex flex-wrap gap-2" data-testid="viz-vars">
              {varNames.map((name) => {
                const value = frame.vars[name];
                const changed = frame.changed === name;
                return (
                  <li
                    key={name}
                    className={`min-w-16 rounded-xl border-2 px-3 py-1 text-center transition-colors ${
                      changed ? 'border-accent bg-accent-soft' : 'border-border'
                    } ${value === undefined ? 'opacity-40' : ''}`}
                  >
                    <div className="font-mono text-xs text-muted">{name}</div>
                    <div
                      key={value === undefined ? '-' : String(value)}
                      className={`font-mono text-xl font-bold ${changed ? 'lp-pop' : ''}`}
                    >
                      {value === undefined ? '–' : formatValue(value)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
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
}
