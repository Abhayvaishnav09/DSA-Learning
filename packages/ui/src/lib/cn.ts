import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our custom tokens so `cn('shadow-raised', 'shadow-floating')` keeps one.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['raised', 'floating', 'overlay', 'glow'] }],
      'font-size': [{ text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] }],
    },
  },
});

/** Joins class names and resolves Tailwind conflicts (last one wins). */
export const cn = (...inputs: ClassValue[]) => merge(clsx(inputs));
