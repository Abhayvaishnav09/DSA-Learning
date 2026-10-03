import type { Locale } from '../engine';

export interface VisualizerLabels {
  region: string;
  code: string;
  boxes: string;
  calls: string;
  screen: string;
  emptyScreen: string;
  play: string;
  pause: string;
  back: string;
  forward: string;
  restart: string;
  speed: string;
  speeds: readonly [string, string, string];
  step: (current: number, total: number) => string;
  now: string;
  checks: string;
  checksCount: (done: number, total: number) => string;
  found: string;
  miss: string;
  seen: string;
  more: (count: number) => string;
}

export const LABELS: Record<Locale, VisualizerLabels> = {
  en: {
    region:
      'Program player. Use the arrow keys to step, Home and End to jump, space to play or pause.',
    code: 'Program',
    boxes: 'Boxes (variables)',
    calls: 'Function calls',
    screen: 'Screen',
    emptyScreen: 'Nothing shown yet',
    play: 'Play',
    pause: 'Pause',
    back: 'Step back',
    forward: 'Step forward',
    restart: 'Start again',
    speed: 'Speed',
    speeds: ['Slow', 'Normal', 'Fast'],
    step: (current, total) => `Step ${current} of ${total}`,
    now: "What's happening",
    checks: 'Comparisons',
    checksCount: (done, total) =>
      `${done} ${done === 1 ? 'comparison' : 'comparisons'} so far (${total} in this run)`,
    found: 'found',
    miss: 'not equal',
    seen: 'checked',
    more: (count) => `+${count} more`,
  },
  'hi-Latn': {
    region:
      'Program player. Arrow keys se ek-ek step chalo, Home aur End se kood jao, space se play ya pause karo.',
    code: 'Program',
    boxes: 'Box (variables)',
    calls: 'Function calls',
    screen: 'Screen',
    emptyScreen: 'Abhi kuch nahi dikha',
    play: 'Play',
    pause: 'Pause',
    back: 'Ek step peeche',
    forward: 'Ek step aage',
    restart: 'Shuru se',
    speed: 'Speed',
    speeds: ['Dheere', 'Normal', 'Tez'],
    step: (current, total) => `Step ${current} / ${total}`,
    now: 'Abhi kya ho raha hai',
    checks: 'Comparisons',
    checksCount: (done, total) => `Ab tak ${done} comparison (is run me kul ${total})`,
    found: 'mil gaya',
    miss: 'barabar nahi',
    seen: 'check ho gaya',
    more: (count) => `+${count} aur`,
  },
};
