'use client';

import { nextDue } from '@logicpath/learning-engine';
import { useMachine } from '@xstate/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ItemCard } from '@/entities/item/ItemCard';
import { useProgress, type LessonBeat } from '@/entities/progress/store';
import { track } from '@/shared/analytics/track';
import { getConcept, getItem, getLesson, text } from '@/shared/content/bundle';
import { formatDay, useLocale, useT } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { ProgressBar } from '@/shared/ui/ProgressBar';
import { PredictBeat, SeeBeat, StoryBeat } from './beats';
import { BEATS, lessonMachine } from './lessonMachine';

export function LessonPlayer({ conceptId }: { conceptId: string }) {
  const hydrated = useHydrated();
  const t = useT();
  // Saved progress decides where the lesson resumes, so wait until it has loaded.
  if (!hydrated) {
    return <p className="p-6 text-muted">{t.loading}</p>;
  }
  return <LessonRun conceptId={conceptId} />;
}

function LessonRun({ conceptId }: { conceptId: string }) {
  const lesson = getLesson(conceptId)!;
  const concept = getConcept(conceptId)!;
  const locale = useLocale();
  const t = useT();
  const saveLessonPosition = useProgress((s) => s.saveLessonPosition);
  const completeLesson = useProgress((s) => s.completeLesson);

  const [resume] = useState(() => {
    const saved = useProgress.getState().lessons[conceptId];
    return saved && !saved.completedAt
      ? { beat: saved.beat, practiceIndex: saved.practiceIndex }
      : undefined;
  });
  const [snapshot, send] = useMachine(lessonMachine, {
    input: { practiceCount: lesson.practice.length, ...(resume ? { resume } : {}) },
  });
  const beat = snapshot.value as LessonBeat;
  const { practiceIndex } = snapshot.context;

  const heading = useRef<HTMLHeadingElement>(null);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    track({ name: 'lesson_beat_entered', conceptId, beat });
    if (beat === 'recap') {
      completeLesson(conceptId);
      track({ name: 'lesson_completed', conceptId, durationMs: Date.now() - startedAt });
    } else {
      saveLessonPosition(conceptId, beat, practiceIndex);
    }
  }, [beat, practiceIndex, conceptId, completeLesson, saveLessonPosition, startedAt]);

  // New beat or question: start at the top and move focus to its heading for screen readers.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [beat, practiceIndex]);

  const next = () => send({ type: 'NEXT' });
  const back = () => send({ type: 'BACK' });
  const beatProps = { lesson, locale, t, onNext: next, onBack: back };
  const practiceItem = getItem(lesson.practice[practiceIndex]!)!;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/learn" className="lp-btn-icon" aria-label={t.lesson.exit}>
          ✕
        </Link>
        <BeatProgress
          beat={beat}
          practiceIndex={practiceIndex}
          practiceCount={lesson.practice.length}
        />
      </div>

      <div>
        <p className="text-sm font-medium text-accent">{text(concept.title, locale)}</p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-sm font-semibold uppercase tracking-wide text-muted outline-none"
          data-testid="beat-title"
        >
          {beat === 'practice'
            ? `${t.lesson.beats.practice} · ${t.lesson.question(practiceIndex + 1, lesson.practice.length)}`
            : t.lesson.beats[beat]}
        </h1>
      </div>

      <div>
        {beat === 'story' && <StoryBeat {...beatProps} onBack={undefined} />}
        {beat === 'see' && <SeeBeat {...beatProps} />}
        {beat === 'predict' && <PredictBeat {...beatProps} />}
        {beat === 'practice' && (
          <ItemCard
            key={practiceItem.id}
            item={practiceItem}
            mode="practice"
            source="lesson"
            onDone={() => send({ type: 'ITEM_DONE' })}
          />
        )}
        {beat === 'recap' && <Recap conceptId={conceptId} />}
      </div>
    </div>
  );
}

function BeatProgress({
  beat,
  practiceIndex,
  practiceCount,
}: {
  beat: LessonBeat;
  practiceIndex: number;
  practiceCount: number;
}) {
  const t = useT();
  const current = BEATS.indexOf(beat);
  return (
    <ol className="flex flex-1 gap-1.5" aria-label={t.lesson.progress}>
      {BEATS.map((b, i) => {
        const fill =
          i < current
            ? 100
            : i > current
              ? 0
              : b === 'practice'
                ? (practiceIndex / practiceCount) * 100
                : b === 'recap'
                  ? 100
                  : 50;
        return (
          <li key={b} className="flex-1" aria-current={i === current ? 'step' : undefined}>
            <span className="sr-only">{t.lesson.beats[b]}</span>
            <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden>
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${fill}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Recap({ conceptId }: { conceptId: string }) {
  const lesson = getLesson(conceptId)!;
  const locale = useLocale();
  const t = useT();
  const state = useProgress((s) => s.concepts[conceptId]);
  const cards = useProgress((s) => s.cards);
  const due = nextDue(lesson.practice.map((id) => cards[id]).filter((c) => c !== undefined));
  const knowledge = Math.round((state?.pKnown ?? 0) * 100);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-bold">{t.lesson.recapTitle}</h2>
      <ul className="flex flex-col gap-2">
        {lesson.recap.map((point, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
            <span aria-hidden className="text-success">
              ✓
            </span>
            <span>{text(point, locale)}</span>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">{t.lesson.knowledge}</h3>
          <span className="font-mono text-lg font-bold" data-testid="recap-knowledge">
            {knowledge}%
          </span>
        </div>
        <ProgressBar value={knowledge} label={t.lesson.knowledge} />
        {due && (
          <p className="text-sm text-muted">{t.lesson.masteryNote(formatDay(due, locale))}</p>
        )}
      </section>
      <div>
        <Link href="/learn" className="lp-btn">
          {t.lesson.backToPath}
        </Link>
      </div>
    </div>
  );
}
