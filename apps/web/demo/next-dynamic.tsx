import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';

/** next/dynamic for the demo build: React.lazy with the same `loading` fallback. */
export default function dynamic<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  options: { loading?: () => ReactNode; ssr?: boolean } = {},
): ComponentType<P> {
  const Lazy = lazy(load);
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={options.loading?.() ?? null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
