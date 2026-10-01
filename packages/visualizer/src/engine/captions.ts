import type { Value } from './parse';
import { formatValue, type Frame } from './run';

/** Text is quoted so learners can tell "5" (text) from 5 (a number). */
const shown = (value: Value) => (typeof value === 'string' ? `"${value}"` : formatValue(value));

export const LOCALES = ['en', 'hi-Latn'] as const;
export type Locale = (typeof LOCALES)[number];

type Templates = {
  [K in Frame['event']['type']]: (e: Extract<Frame['event'], { type: K }>) => string;
};

/**
 * Plain-language narration for every step, in every locale (docs/01-learning-science.md §9).
 * Authors can override any frame's caption in content.
 */
const TEMPLATES: Record<Locale, Templates> = {
  en: {
    start: () => 'Ready. Press play or step forward to run the program one line at a time.',
    assign: (e) =>
      e.previous === undefined
        ? `Make a box called ${e.name} and put ${shown(e.value)} in it.`
        : e.work === formatValue(e.value)
          ? `${e.name} changes from ${formatValue(e.previous)} to ${formatValue(e.value)}.`
          : `Work out ${e.work} = ${formatValue(e.value)}. Now ${e.name} holds ${formatValue(e.value)}.`,
    say: (e) => `Show ${shown(e.value)} on the screen.`,
    'loop-enter': (e) =>
      `${e.name} is ${e.value}. ${e.value} is not more than ${e.to}, so run the lines inside the loop.`,
    'loop-exit': (e) =>
      `${e.name} would be ${e.value}, which is more than ${e.to}. The loop stops.`,
    'while-check': (e) =>
      e.result
        ? `Is ${e.condition}? Yes, so run the lines inside again.`
        : `Is ${e.condition}? No, so the loop stops.`,
    'if-check': (e) =>
      e.result
        ? `Is ${e.condition}? Yes, so run the "if" lines.`
        : `Is ${e.condition}? No, so skip to "else" (if there is one).`,
    end: () => 'The program has finished.',
  },
  'hi-Latn': {
    start: () => 'Taiyaar. Play dabao ya ek-ek line aage badho.',
    assign: (e) =>
      e.previous === undefined
        ? `${e.name} naam ka box banao aur usme ${shown(e.value)} rakho.`
        : e.work === formatValue(e.value)
          ? `${e.name} ${formatValue(e.previous)} se badal kar ${formatValue(e.value)} ho gaya.`
          : `${e.work} = ${formatValue(e.value)} nikalo. Ab ${e.name} me ${formatValue(e.value)} hai.`,
    say: (e) => `Screen par ${shown(e.value)} dikhao.`,
    'loop-enter': (e) =>
      `${e.name} abhi ${e.value} hai. ${e.value}, ${e.to} se zyada nahi hai, isliye loop ke andar ki lines chalao.`,
    'loop-exit': (e) => `${e.name} ab ${e.value} hota, jo ${e.to} se zyada hai. Loop ruk gaya.`,
    'while-check': (e) =>
      e.result
        ? `Kya ${e.condition}? Haan, isliye andar ki lines phir se chalao.`
        : `Kya ${e.condition}? Nahi, isliye loop ruk gaya.`,
    'if-check': (e) =>
      e.result
        ? `Kya ${e.condition}? Haan, isliye "if" wali lines chalao.`
        : `Kya ${e.condition}? Nahi, isliye "else" par jao (agar hai).`,
    end: () => 'Program khatam ho gaya.',
  },
};

export function caption(frame: Frame, locale: Locale): string {
  const template = TEMPLATES[locale][frame.event.type] as (e: Frame['event']) => string;
  return template(frame.event);
}
