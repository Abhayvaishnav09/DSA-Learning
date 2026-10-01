interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  label: string;
  tone?: 'accent' | 'success';
}

export function ProgressBar({ value, label, tone = 'accent' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-border"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
          tone === 'success' ? 'bg-success' : 'bg-accent'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
