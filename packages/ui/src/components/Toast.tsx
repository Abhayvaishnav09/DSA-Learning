'use client';

import { Toaster as Sonner, toast } from 'sonner';

/** Mount once at the app root. Toasts are announced politely to screen readers. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      toastOptions={{
        classNames: {
          toast: '!rounded-2xl !border !border-border !bg-surface !text-fg !shadow-overlay',
          description: '!text-muted',
          actionButton: '!bg-accent !text-accent-fg',
        },
      }}
    />
  );
}

export { toast };
