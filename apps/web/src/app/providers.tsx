'use client';

import { ApiProvider } from '@logicpath/api-client/react';
import { Toaster, TooltipProvider } from '@logicpath/ui';
import { MotionProvider } from '@logicpath/ui/motion';
import { useEffect, type ReactNode } from 'react';
import { getApiClient } from '@/shared/api/client';
import { useLocale } from '@/shared/i18n/useT';
import { useHydrated } from '@/shared/lib/useHydrated';
import { useSession } from '@/shared/session/store';
import { useSettings } from '@/shared/settings/store';

/** Keeps <html> in sync with the learner's settings: language, theme, contrast. */
function useDocumentSettings() {
  const locale = useLocale();
  const theme = useSettings((s) => s.theme);
  const contrast = useSettings((s) => s.contrast);
  useEffect(() => {
    document.documentElement.lang = locale === 'hi-Latn' ? 'hi-Latn' : 'en';
  }, [locale]);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (contrast === 'more') document.documentElement.dataset.contrast = 'more';
    else document.documentElement.removeAttribute('data-contrast');
  }, [contrast]);
}

/** Everything the app needs around every page: API, motion settings, tooltips, toasts, session. */
export function Providers({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const motion = useSettings((s) => s.motion);
  useDocumentSettings();
  useEffect(() => {
    void useSession.getState().restore();
  }, []);
  useEffect(() => {
    // Offline support for the installed app (not in dev, where it would cache stale code).
    if (
      process.env.NODE_ENV === 'production' &&
      location.protocol === 'https:' &&
      'serviceWorker' in navigator
    ) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <MotionProvider mode={hydrated ? motion : 'full'}>
      <ApiProvider client={getApiClient()}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </ApiProvider>
    </MotionProvider>
  );
}
