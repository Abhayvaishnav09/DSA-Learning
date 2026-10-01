import type { Locale } from '@logicpath/content-schema';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '../lib/storage';

export type Theme = 'system' | 'light' | 'dark';

interface SettingsState {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'en',
      theme: 'system',
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'logicpath:settings',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({ locale, theme }) => ({ locale, theme }),
    },
  ),
);
