'use client';

import type { Lesson, Locale } from '@logicpath/content-schema';
import { Visualizer } from '@logicpath/visualizer/react';
import { useCallback, useMemo, useState } from 'react';
import { ItemCard } from '@/entities/item/ItemCard';
import { getItem, text } from '@/shared/content/bundle';
import type { Messages } from '@/shared/i18n/messages';
import { ComplexityNotes } from '@/shared/ui/ComplexityNotes';

interface BeatProps {
  lesson: Lesson;
  locale: Locale;
  t: Messages;
  onNext: () => void;
  onBack?: () => void;
}

export function StoryBeat({ lesson, locale, t, onNext }: BeatProps) {
  const { story } = lesson;
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-bold sm:text-3xl">{text(story.title, locale)}</h2>
      <div className="flex flex-col gap-3 text-lg leading-relaxed">
        {story.body.map((paragraph, i) => (
          <p key={i}>{text(paragraph, locale)}</p>
        ))}
      </div>
      {story.terms.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {t.lesson.newWords}
          </h3>
          <dl className="grid gap-3">
            {story.terms.map((term, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(9rem,auto)_1fr] sm:gap-4"
              >
                <dt className="font-mono font-semibold text-accent">{text(term.term, locale)}</dt>
                <dd>{text(term.meaning, locale)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <BeatNav t={t} onNext={onNext} />
    </div>
  );
}

function useLocalizedCaptions(lesson: Lesson, locale: Locale) {
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(lesson.see.captions).map(([k, v]) => [Number(k), text(v, locale)]),
      ),
    [lesson, locale],
  );
}

export function SeeBeat({ lesson, locale, t, onNext, onBack }: BeatProps) {
  const captions = useLocalizedCaptions(lesson, locale);
  const [reachedEnd, setReachedEnd] = useState(false);
  const onFrameChange = useCallback((_: unknown, isLast: boolean) => {
    if (isLast) setReachedEnd(true);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">{text(lesson.see.intro, locale)}</p>
      <Visualizer
        source={lesson.see.code}
        locale={locale}
        captions={captions}
        onFrameChange={onFrameChange}
      />
      {lesson.see.complexity && (
        <ComplexityNotes
          complexity={lesson.see.complexity}
          locale={locale}
          title={t.lesson.complexity}
        />
      )}
      <BeatNav
        t={t}
        onNext={onNext}
        onBack={onBack}
        nextDisabled={!reachedEnd}
        note={reachedEnd ? undefined : t.lesson.watchToEnd}
      />
    </div>
  );
}

export function PredictBeat({ lesson, locale, t, onNext, onBack }: BeatProps) {
  const captions = useLocalizedCaptions(lesson, locale);
  const item = getItem(lesson.predict.item)!;
  const [paused, setPaused] = useState(false);
  const [predicted, setPredicted] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const pauseAt = lesson.predict.pauseAt;

  const onFrameChange = useCallback(
    (frame: { index: number }, isLast: boolean) => {
      if (frame.index >= pauseAt) setPaused(true);
      if (isLast) setReachedEnd(true);
    },
    [pauseAt],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">{text(lesson.predict.intro, locale)}</p>
      <Visualizer
        source={lesson.see.code}
        locale={locale}
        captions={captions}
        autoPlay
        {...(predicted ? {} : { limit: pauseAt })}
        onFrameChange={onFrameChange}
      />
      {paused && (
        <section
          className="rounded-2xl border-2 border-accent/40 bg-surface p-4 sm:p-5"
          aria-label={t.lesson.beats.predict}
        >
          {!predicted && <p className="mb-3 font-medium text-accent">{t.lesson.predictPrompt}</p>}
          <ItemCard item={item} mode="predict" source="predict" onDone={() => setPredicted(true)} />
          {predicted && <p className="mt-3 font-medium">{t.lesson.watchReveal}</p>}
        </section>
      )}
      <BeatNav
        t={t}
        onNext={onNext}
        onBack={onBack}
        nextDisabled={!predicted || !reachedEnd}
        note={predicted && !reachedEnd ? t.lesson.watchToEnd : undefined}
      />
    </div>
  );
}

export function BeatNav({
  t,
  onNext,
  onBack,
  nextDisabled = false,
  note,
}: {
  t: Messages;
  onNext: () => void;
  onBack?: (() => void) | undefined;
  nextDisabled?: boolean;
  note?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && (
          <button type="button" className="lp-btn-ghost" onClick={onBack}>
            {t.lesson.back}
          </button>
        )}
        <button
          type="button"
          className="lp-btn ml-auto"
          onClick={onNext}
          disabled={nextDisabled}
          data-testid="beat-next"
        >
          {t.lesson.continue}
        </button>
      </div>
      {note && <p className="text-right text-sm text-muted">{note}</p>}
    </div>
  );
}
