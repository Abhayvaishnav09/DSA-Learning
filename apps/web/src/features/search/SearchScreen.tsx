'use client';

import { useApi } from '@logicpath/api-client/react';
import type { platform } from '@logicpath/contracts';
import { Badge, EmptyState, Field, Input, Segmented, Skeleton } from '@logicpath/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import { useLocale, useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

type Type = platform.SearchType | 'all';

/** The text with the matching parts marked, built from the [start, end) ranges the server sent. */
function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start < at) return;
    parts.push(<Fragment key={`t${i}`}>{text.slice(at, start)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className="rounded bg-xp-soft px-0.5 text-fg">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{parts}</>;
}

export function SearchScreen() {
  const t = useT().s.search;
  const locale = useLocale();
  const router = useRouter();
  const initial = useSearchParams().get('q') ?? '';
  const [input, setInput] = useState(initial);
  const [query, setQuery] = useState(initial.trim());
  const [type, setType] = useState<Type>('all');

  // Wait for a pause in typing before asking, and keep the address in step so results can be shared.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = input.trim();
      setQuery(next);
      router.replace(next ? routes.search(next) : routes.search(), { scroll: false });
    }, 250);
    return () => clearTimeout(id);
  }, [input, router]);

  const results = useApi(
    'search.query',
    { query: { q: query, locale, ...(type === 'all' ? {} : { type }) } },
    { enabled: query.length > 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
      <Field label={t.label}>
        <Input
          type="search"
          placeholder={t.placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          data-testid="search-input"
        />
      </Field>
      <Segmented
        label={t.title}
        value={type}
        onChange={setType}
        options={[
          { value: 'all', label: t.all },
          ...(['concept', 'lesson', 'item', 'misconception'] as const).map((value) => ({
            value,
            label: t.types[value],
          })),
        ]}
      />
      {query.length === 0 ? (
        <EmptyState icon={<Search />} title={t.start} />
      ) : results.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : results.data && results.data.hits.length > 0 ? (
        <section aria-live="polite">
          <p className="mb-3 text-sm text-muted" data-testid="search-count">
            {t.results(results.data.total, query)}
          </p>
          <ul className="flex flex-col gap-3">
            {results.data.hits.map((hit) => (
              <li key={`${hit.type}:${hit.id}`}>
                <Link
                  href={routes.lesson(hit.conceptId)}
                  className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
                  data-testid="search-hit"
                >
                  <span className="flex items-center gap-2">
                    <Badge tone="accent">{t.typeOne[hit.type]}</Badge>
                    <span className="font-semibold">{hit.title}</span>
                  </span>
                  <span className="text-sm text-muted">
                    <Highlighted text={hit.snippet} ranges={hit.highlights} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState icon={<Search />} title={t.none} />
      )}
    </div>
  );
}
