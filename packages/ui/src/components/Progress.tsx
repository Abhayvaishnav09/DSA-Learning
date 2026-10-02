import { cn } from '../lib/cn';

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const TONES = {
  accent: { bar: 'bg-accent', stroke: 'stroke-accent' },
  success: { bar: 'bg-success', stroke: 'stroke-success' },
  xp: { bar: 'bg-xp', stroke: 'stroke-xp' },
  info: { bar: 'bg-accent-2', stroke: 'stroke-accent-2' },
};

export function ProgressBar({
  value,
  label,
  tone = 'accent',
  className,
}: {
  /** 0 to 100 */
  value: number;
  label: string;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const pct = clamp(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          TONES[tone].bar,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Circular progress (daily goal, level progress) with the value in the middle. */
export function ProgressRing({
  value,
  label,
  size = 96,
  stroke = 10,
  tone = 'accent',
  children,
  className,
}: {
  value: number;
  label: string;
  size?: number;
  stroke?: number;
  tone?: keyof typeof TONES;
  children?: React.ReactNode;
  className?: string;
}) {
  const pct = clamp(value);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-2"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className={cn(
            'transition-[stroke-dashoffset] duration-1000 ease-out',
            TONES[tone].stroke,
          )}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
