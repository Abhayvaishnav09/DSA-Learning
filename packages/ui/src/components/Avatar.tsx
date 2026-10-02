import { cn } from '../lib/cn';

const GRADIENTS = [
  'from-violet-500 to-indigo-500',
  'from-cyan-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-fuchsia-500 to-purple-500',
];

/** Same seed, same colour, on every device: a cheap 32-bit string hash. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts.at(-1)![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
};

export function Avatar({
  name,
  seed = name,
  size = 'md',
  className,
  decorative = false,
}: {
  name: string;
  seed?: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** Hide from screen readers when the name is already written next to it. */
  decorative?: boolean;
}) {
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white shadow-raised select-none',
        GRADIENTS[hash(seed) % GRADIENTS.length],
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
