import Link from 'next/link';
import { cn } from '@logicpath/ui';

/** The mark: curly braces in a gradient tile, plus the word mark when there's room. */
export function Logo({
  href,
  label,
  compact = false,
  className,
}: {
  href: string;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'flex shrink-0 items-center gap-2.5 rounded-xl font-bold tracking-tight',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-mono text-sm text-white shadow-glow"
      >
        {'{ }'}
      </span>
      {!compact && <span className="text-lg">LogicPath</span>}
    </Link>
  );
}
