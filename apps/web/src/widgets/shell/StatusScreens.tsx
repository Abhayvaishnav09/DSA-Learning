'use client';

import { Button, EmptyState, Skeleton } from '@logicpath/ui';
import { Compass, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useT } from '@/shared/i18n/useT';
import { routes } from '@/shared/routing/routes';

export function NotFoundScreen() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={<Compass />}
        title={t.shell.notFoundTitle}
        description={t.shell.notFoundBody}
        action={
          <Button asChild>
            <Link href={routes.learn}>{t.shell.goHome}</Link>
          </Button>
        }
      />
    </div>
  );
}

/** Route-level error boundary content: friendly words, a retry, and the error sent to logs. */
export function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={<TriangleAlert />}
        title={t.shell.errorTitle}
        description={
          <>
            {t.shell.errorBody}
            {error.digest && (
              <span className="mt-2 block font-mono text-xs text-subtle">ref {error.digest}</span>
            )}
          </>
        }
        action={<Button onClick={reset}>{t.shell.retry}</Button>}
      />
    </div>
  );
}

/** Shown while a page's code or data loads: the shape of a page, not a spinner. */
export function PageSkeleton() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6" role="status" aria-label={t.loading}>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </div>
  );
}
