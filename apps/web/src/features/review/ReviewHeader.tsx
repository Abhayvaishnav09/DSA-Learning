'use client';

import { useT } from '@/shared/i18n/useT';

export function ReviewHeader() {
  const t = useT();
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold">{t.review.title}</h1>
      <p className="text-muted">{t.review.intro}</p>
    </header>
  );
}
