import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Page title block: optional eyebrow, title, description and actions that wrap on phones. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        )}
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Numbered progress through steps (sign-up, lesson beats). */
export function Stepper({
  steps,
  current,
  label,
  className,
}: {
  steps: string[];
  current: number;
  label: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn('flex items-center gap-2', className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step}
            className="flex flex-1 items-center gap-2"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-success text-white',
                active && 'bg-accent text-accent-fg shadow-glow',
                !done && !active && 'bg-surface-2 text-muted',
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                'hidden truncate text-sm sm:inline',
                active ? 'font-semibold' : 'text-muted',
              )}
            >
              {step}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-success' : 'bg-border')}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export const VisuallyHidden = ({ children }: { children: ReactNode }) => (
  <span className="sr-only">{children}</span>
);
