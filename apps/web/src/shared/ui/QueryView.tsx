'use client';

import type { ApiError } from '@logicpath/api-client';
import { Button, EmptyState, Skeleton } from '@logicpath/ui';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n/useT';

interface QueryLike<T> {
  data: T | undefined;
  error: ApiError | null;
  isPending: boolean;
  refetch: () => unknown;
}

/**
 * The same three states on every screen that loads data: a skeleton while it loads, a friendly
 * message with a retry when it fails, and the real content when it is there.
 */
export function QueryView<T>({
  query,
  children,
  skeleton,
}: {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  const t = useT();
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.error) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title={t.s.common.errorTitle}
        description={query.error.message || t.s.common.errorBody}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t.s.common.retry}
          </Button>
        }
      />
    );
  }
  return (
    <div role="status" aria-busy="true" aria-label={t.loading}>
      {skeleton ?? <DefaultSkeleton />}
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
