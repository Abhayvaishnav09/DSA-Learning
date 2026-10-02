'use client';

import { MASTERY_THRESHOLD } from '@logicpath/learning-engine';
import Link from 'next/link';
import { Suspense } from 'react';
import { useConceptViews, useReviewQueue, type ConceptView } from '@/entities/progress/selectors';
import { useProgress } from '@/entities/progress/store';
import { bundle, getConcept, text } from '@/shared/content/bundle';
import { formatDay, useLocale, useT } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { ProgressBar } from '@logicpath/ui';
import { MapPanel } from './MapPanel';

export function LearnHome() {
  const hydrated = useHydrated();
  const t = useT();
  if (!hydrated) return <p className="text-muted">{t.loading}</p>;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{t.home.title}</h1>
      <TodayCard />
      {/* The map reads ?concept= from the URL, which needs a Suspense boundary when prerendered. */}
      <Suspense>
        <MapPanel />
      </Suspense>
      <ConceptMap />
    </div>
  );
}

function TodayCard() {
  const t = useT();
  const locale = useLocale();
  const streak = useProgress((s) => s.streak.current);
  const lessons = useProgress((s) => s.lessons);
  const { due, nextDueAt } = useReviewQueue();
  const views = useConceptViews();

  const upNext =
    views.find((v) => v.status === 'learning' && !lessons[v.concept.id]?.completedAt) ??
    views.find((v) => v.status === 'available') ??
    views.find((v) => v.status === 'learning');
  const lesson = upNext ? lessons[upNext.concept.id] : undefined;
  const lessonLabel = !lesson
    ? t.home.start
    : lesson.completedAt
      ? t.home.practiseAgain
      : t.home.continue;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label={t.home.today}>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">{t.home.upNext}</p>
        {upNext ? (
          <>
            <p className="text-xl font-bold">{text(upNext.concept.title, locale)}</p>
            <div>
              <Link href={`/learn/${upNext.concept.id}`} className="lp-btn" data-testid="up-next">
                {lessonLabel}
              </Link>
            </div>
          </>
        ) : (
          <p>{t.home.allCaughtUp}</p>
        )}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          <span aria-hidden>🔥 </span>
          {t.home.streak(streak)}
        </p>
        <p className="text-xl font-bold" data-testid="reviews-due">
          {t.home.reviewsDue(due.length)}
        </p>
        {due.length > 0 ? (
          <div>
            <Link href="/review" className="lp-btn">
              {t.home.startReview}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {nextDueAt ? t.home.nextReview(formatDay(nextDueAt, locale)) : t.home.noReviewsYet}
          </p>
        )}
      </div>
    </section>
  );
}

const MASTERY_PCT = MASTERY_THRESHOLD * 100;

const STATUS_STYLE: Record<string, string> = {
  soon: 'bg-border text-muted',
  locked: 'bg-border text-muted',
  available: 'bg-accent-soft text-accent',
  learning: 'bg-warning-soft text-warning',
  mastered: 'bg-success-soft text-success',
};

function ConceptMap() {
  const views = useConceptViews();
  return (
    <div className="flex flex-col gap-8">
      {bundle.stages.map((stage) => (
        <section key={stage.id} aria-labelledby={`stage-${stage.id}`}>
          <StageHeading id={stage.id} />
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {views
              .filter((v) => v.concept.stage === stage.id)
              .map((view) => (
                <li key={view.concept.id}>
                  <ConceptCard view={view} />
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function StageHeading({ id }: { id: number }) {
  const t = useT();
  const locale = useLocale();
  const stage = bundle.stages.find((s) => s.id === id)!;
  return (
    <h2 id={`stage-${id}`} className="mb-3 flex items-baseline gap-2">
      <span className="text-sm font-semibold uppercase tracking-wide text-muted">
        {t.map.stage(id)}
      </span>
      <span className="text-lg font-bold">{text(stage.title, locale)}</span>
    </h2>
  );
}

function ConceptCard({ view }: { view: ConceptView }) {
  const t = useT();
  const locale = useLocale();
  const { concept, status, knowledge, minutes } = view;
  const label = concept.published ? status : 'soon';
  const open = concept.published && status !== 'locked';
  const needs = concept.prerequisites
    .map((id) => getConcept(id))
    .filter((c) => c !== undefined)
    .map((c) => text(c.title, locale));

  const body = (
    <div
      className={`flex h-full flex-col gap-2 rounded-2xl border-2 p-4 transition-colors ${
        open
          ? 'border-border bg-surface hover:border-accent'
          : 'border-dashed border-border text-muted'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{text(concept.title, locale)}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[label]}`}
        >
          {status === 'mastered' && <span aria-hidden>✓ </span>}
          {t.map.status[label]}
        </span>
      </div>
      {(status === 'learning' || status === 'mastered') && (
        <div className="flex flex-col gap-1">
          <ProgressBar
            value={knowledge}
            label={t.map.knowledge(knowledge)}
            tone={status === 'mastered' ? 'success' : 'accent'}
          />
          <span className="text-xs text-muted">
            {t.map.knowledge(knowledge)}
            {status === 'learning' && knowledge >= MASTERY_PCT && ` · ${t.map.recallPending}`}
          </span>
        </div>
      )}
      {!open && needs.length > 0 && (
        <p className="text-xs text-muted">
          {t.map.needs} {needs.join(', ')}
        </p>
      )}
      {open && minutes && <p className="mt-auto text-xs text-muted">{t.map.minutes(minutes)}</p>}
    </div>
  );

  return open ? (
    <Link
      href={`/learn/${concept.id}`}
      className="block h-full rounded-2xl"
      data-testid={`concept-${concept.id}`}
    >
      {body}
    </Link>
  ) : (
    <div className="h-full" data-testid={`concept-${concept.id}`}>
      {body}
    </div>
  );
}
