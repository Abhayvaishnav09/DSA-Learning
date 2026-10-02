import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const cardVariants = cva('rounded-2xl border border-border bg-surface text-fg', {
  variants: {
    elevation: {
      flat: '',
      raised: 'shadow-raised',
      floating: 'shadow-floating',
    },
    interactive: {
      true: 'transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-floating focus-within:border-accent/40',
    },
    padding: { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-7' },
  },
  defaultVariants: { elevation: 'raised', padding: 'md' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, elevation, interactive, padding, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ elevation, interactive, padding }), className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...props} />
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-semibold', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
