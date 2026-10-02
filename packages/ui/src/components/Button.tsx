import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap select-none ' +
    'transition-[background,color,border-color,box-shadow,transform] duration-200 ease-out ' +
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg shadow-raised hover:bg-accent-hover hover:shadow-floating',
        secondary:
          'border border-border-strong bg-surface text-fg shadow-raised hover:border-accent hover:text-accent',
        soft: 'bg-accent-soft text-accent hover:bg-accent hover:text-accent-fg',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        outline: 'border-2 border-accent/50 text-accent hover:bg-accent-soft',
        danger: 'bg-danger text-white shadow-raised hover:brightness-110',
        link: 'h-auto px-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-lg px-3 text-sm [&_svg]:size-4',
        md: 'h-11 rounded-xl px-5 text-sm [&_svg]:size-[1.125rem]',
        lg: 'h-13 rounded-2xl px-7 text-base [&_svg]:size-5',
        icon: 'size-11 rounded-xl [&_svg]:size-5',
        'icon-sm': 'size-9 rounded-lg [&_svg]:size-4',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a link) with button styles. */
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

/** Icon-only button: the label is required, because the icon alone says nothing to a screen reader. */
export function IconButton({
  label,
  size = 'icon',
  variant = 'ghost',
  children,
  ...props
}: Omit<ButtonProps, 'aria-label'> & { label: string }) {
  return (
    <Button aria-label={label} title={label} size={size} variant={variant} {...props}>
      {children}
    </Button>
  );
}
