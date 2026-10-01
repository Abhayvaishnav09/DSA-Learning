import type { Locale } from '../engine';

export interface VisualizerLabels {
  region: string;
  code: string;
  boxes: string;
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
}

export const LABELS: Record<Locale, VisualizerLabels> = {
  en: {
    region: 'Program player. Use the arrow keys to step, space to play or pause.',
    code: 'Program',
    boxes: 'Boxes (variables)',
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
  },
  'hi-Latn': {
    region: 'Program player. Arrow keys se ek-ek step chalo, space se play ya pause karo.',
    code: 'Program',
    boxes: 'Box (variables)',
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
  },
};
