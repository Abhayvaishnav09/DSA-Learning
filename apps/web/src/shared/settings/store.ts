import type { Locale } from '@logicpath/content-schema';
import type { MotionMode } from '@logicpath/ui/motion';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '../lib/storage';

export type Theme = 'system' | 'light' | 'dark';
export type Contrast = 'normal' | 'more';

interface SettingsState {
  locale: Locale;
  theme: Theme;
  /** How much the interface moves (also capped by the OS "reduce motion" setting). */
  motion: MotionMode;
  contrast: Contrast;
  /** Desktop sidebar collapsed to icons. */
  sidebarCollapsed: boolean;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setMotion: (motion: MotionMode) => void;
  setContrast: (contrast: Contrast) => void;
  toggleSidebar: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'en',
      theme: 'system',
      motion: 'full',
      contrast: 'normal',
      sidebarCollapsed: false,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setMotion: (motion) => set({ motion }),
      setContrast: (contrast) => set({ contrast }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'logicpath:settings',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      // v1 had only locale and theme; keep them and take defaults for the rest.
      migrate: (persisted) => persisted as SettingsState,
      partialize: ({ locale, theme, motion, contrast, sidebarCollapsed }) => ({
        locale,
        theme,
        motion,
        contrast,
        sidebarCollapsed,
      }),
    },
  ),
);
