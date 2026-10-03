import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/shared/lib/storage';
import { EXAMPLES, type CodeLanguage } from './examples';

export interface Draft {
  language: CodeLanguage;
  code: string;
  stdin: string;
}

interface DraftState extends Draft {
  update: (change: Partial<Draft>) => void;
}

export const FIRST_DRAFT: Draft = { language: 'python', code: EXAMPLES[0]!.code, stdin: '' };

/** The program on the visualize screen, kept on this device only (never sent anywhere). */
export const useDraft = create<DraftState>()(
  persist((set) => ({ ...FIRST_DRAFT, update: (change) => set(change) }), {
    name: 'logicpath:visualize',
    storage: createJSONStorage(() => safeLocalStorage),
    partialize: ({ language, code, stdin }) => ({ language, code, stdin }),
  }),
);
