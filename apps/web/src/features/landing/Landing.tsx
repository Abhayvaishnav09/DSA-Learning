'use client';

import Link from 'next/link';
import { useT } from '@/shared/i18n/useT';

export function Landing() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:py-20">
      <section className="flex max-w-2xl flex-col items-start gap-5">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          {t.landing.title}
        </h1>
        <p className="text-lg text-muted sm:text-xl">{t.landing.subtitle}</p>
        <Link href="/learn" className="lp-btn text-lg" data-testid="start-learning">
          {t.landing.cta}
        </Link>
      </section>
      <section aria-labelledby="how">
        <h2 id="how" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {t.landing.how}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t.landing.steps.map((step, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
            >
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-full bg-accent-soft font-bold text-accent"
              >
                {i + 1}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
