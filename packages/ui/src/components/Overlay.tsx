'use client';

import { X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { Dialog as D } from 'radix-ui';
import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useMotionPrefs } from '../motion/MotionProvider';
import { transitions } from '../motion/tokens';

const OpenContext = createContext(false);

/**
 * Modal dialog (Radix: focus trap, Esc, scroll lock, labelled) with an animated entrance.
 * Controlled (`open` + `onOpenChange`) so AnimatePresence can play the exit.
 */
export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
    </D.Root>
  );
}

export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

function Backdrop() {
  return (
    <D.Overlay forceMount asChild>
      <m.div
        className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitions.base}
      />
    </D.Overlay>
  );
}

export function DialogContent({
  title,
  description,
  children,
  className,
  hideClose = false,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  hideClose?: boolean;
}) {
  const open = useContext(OpenContext);
  const { allowMovement } = useMotionPrefs();
  return (
    <AnimatePresence>
      {open && (
        <D.Portal forceMount>
          <Backdrop />
          <D.Content forceMount asChild>
            <m.div
              className={cn(
                'fixed top-1/2 left-1/2 z-50 flex max-h-[min(90dvh,48rem)] w-[min(calc(100vw-2rem),32rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay',
                className,
              )}
              initial={{
                opacity: 0,
                scale: allowMovement ? 0.96 : 1,
                x: '-50%',
                y: allowMovement ? '-46%' : '-50%',
              }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: allowMovement ? 0.97 : 1, x: '-50%', y: '-50%' }}
              transition={transitions.gentle}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="flex flex-col gap-1">
                  <D.Title className="text-lg font-semibold">{title}</D.Title>
                  {description ? (
                    <D.Description className="text-sm text-muted">{description}</D.Description>
                  ) : (
                    <D.Description className="sr-only">{title}</D.Description>
                  )}
                </div>
                {!hideClose && (
                  <D.Close
                    className="-mr-2 grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
                    aria-label="Close"
                  >
                    <X className="size-5" aria-hidden />
                  </D.Close>
                )}
              </div>
              <div className="overflow-y-auto px-5 py-4">{children}</div>
            </m.div>
          </D.Content>
        </D.Portal>
      )}
    </AnimatePresence>
  );
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-4 flex flex-wrap justify-end gap-2', className)}>{children}</div>;
}

/**
 * Sheet: slides in from an edge. `side="auto"` is a bottom sheet on phones and a right panel on
 * wider screens, the pattern people expect on each.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'auto',
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  side?: 'auto' | 'right' | 'left' | 'bottom';
  children: ReactNode;
  className?: string;
}) {
  const { allowMovement } = useMotionPrefs();
  const isBottom =
    side === 'bottom' ||
    (side === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(width < 600px)').matches);
  const from = isBottom ? { y: '100%' } : side === 'left' ? { x: '-100%' } : { x: '100%' };
  const placement = isBottom
    ? 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl lp-safe-bottom'
    : side === 'left'
      ? 'inset-y-0 left-0 w-[min(100vw,26rem)] rounded-r-3xl'
      : 'inset-y-0 right-0 w-[min(100vw,30rem)] rounded-l-3xl';

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <Backdrop />
            <D.Content forceMount asChild>
              <m.div
                className={cn(
                  'fixed z-50 flex flex-col border border-border bg-surface shadow-overlay',
                  placement,
                  className,
                )}
                initial={allowMovement ? from : { opacity: 0 }}
                animate={allowMovement ? { x: 0, y: 0 } : { opacity: 1 }}
                exit={allowMovement ? from : { opacity: 0 }}
                transition={transitions.gentle}
              >
                {isBottom && (
                  <div
                    className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border-strong"
                    aria-hidden
                  />
                )}
                <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
                  <div className="flex flex-col gap-1">
                    <D.Title className="text-lg font-semibold">{title}</D.Title>
                    {description ? (
                      <D.Description className="text-sm text-muted">{description}</D.Description>
                    ) : (
                      <D.Description className="sr-only">{title}</D.Description>
                    )}
                  </div>
                  <D.Close
                    className="-mr-2 grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
                    aria-label="Close"
                  >
                    <X className="size-5" aria-hidden />
                  </D.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
              </m.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}
