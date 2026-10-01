'use client';

import { dueCards, type ReviewCard } from '@logicpath/learning-engine';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ItemCard } from '@/entities/item/ItemCard';
import { useProgress } from '@/entities/progress/store';
import { track } from '@/shared/analytics/track';
import { itemFamily } from '@/shared/content/bundle';
import { useT } from '@/shared/i18n/useT';
import { now } from '@/shared/lib/clock';
import { useHydrated } from '@/shared/lib/useHydrated';
import { ProgressBar } from '@/shared/ui/ProgressBar';

/** Rotate through the original and its variations so learners recall the logic, not the answer. */
function itemForCard(card: ReviewCard) {
  const family = itemFamily(card.itemId);
  return family[card.reps % family.length] ?? family[0];
}

export function ReviewSession() {
  const hydrated = useHydrated();
  const t = useT();
  if (!hydrated) return <p className="text-muted">{t.loading}</p>;
  return <ReviewRun />;
}

function ReviewRun() {
  const t = useT();
  // The queue is fixed when the session starts; rescheduled cards don't reappear mid-session.
  const [queue] = useState(() => dueCards(Object.values(useProgress.getState().cards), now()));
  const [index, setIndex] = useState(0);
  const finished = queue.length > 0 && index >= queue.length;

  useEffect(() => {
    if (finished) track({ name: 'review_completed', count: queue.length });
  }, [finished, queue.length]);

  if (queue.length === 0 || finished) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold">{finished ? t.review.doneTitle : t.review.nothingDue}</h2>
        {finished && <p>{t.review.doneBody}</p>}
        <Link href="/learn" className="lp-btn">
          {t.lesson.backToPath}
        </Link>
      </div>
    );
  }

  const card = queue[index]!;
  const item = itemForCard(card);
  if (!item) {
    // Content removed since the card was made: skip it.
    return (
      <button type="button" className="lp-btn" onClick={() => setIndex(index + 1)}>
        {t.item.next}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar
        value={(index / queue.length) * 100}
        label={t.review.progress(index + 1, queue.length)}
      />
      <ItemCard
        key={`${card.itemId}:${index}`}
        item={item}
        mode="practice"
        source="review"
        heading={t.review.progress(index + 1, queue.length)}
        onDone={() => setIndex(index + 1)}
      />
    </div>
  );
}
