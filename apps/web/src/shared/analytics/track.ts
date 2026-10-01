/**
 * Product analytics seam (docs/05-data.md §6). In R0 events stay in the browser:
 * they are kept on window.__lpEvents for debugging and tests. R1 sends them to the ingest API.
 */
export type AnalyticsEvent =
  | { name: 'lesson_beat_entered'; conceptId: string; beat: string }
  | { name: 'lesson_completed'; conceptId: string; durationMs: number }
  | {
      name: 'item_attempted';
      itemId: string;
      correct: boolean;
      hintLevel: number;
      misconception: string | null;
      source: string;
    }
  | { name: 'hint_shown'; itemId: string; level: number }
  | { name: 'solution_shown'; itemId: string }
  | { name: 'review_completed'; count: number }
  | { name: 'locale_changed'; locale: string };

declare global {
  interface Window {
    __lpEvents?: (AnalyticsEvent & { at: string })[];
  }
}

export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  const events = (window.__lpEvents ??= []);
  events.push({ ...event, at: new Date().toISOString() });
  if (events.length > 500) events.shift();
}
