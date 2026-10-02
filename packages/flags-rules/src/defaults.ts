import type { FlagDef } from './flags';

/** A flag as it is first seeded, with the words an admin sees next to it. */
export interface SeedFlag extends FlagDef {
  description: string;
}

const everyone = { rolloutPercent: 100, roles: [], platforms: [], minAppVersion: null } as const;

/** Flags every installation starts with: the flags service and the in-browser demo seed the same list. */
export const DEFAULT_FLAGS: readonly SeedFlag[] = [
  {
    key: 'map.3d',
    description: 'Show the 3D learning map (devices that cannot draw it get the flat map anyway).',
    enabled: true,
    ...everyone,
    value: null,
  },
  {
    key: 'lesson.celebrations',
    description: 'Burst animation after a right answer.',
    enabled: true,
    ...everyone,
    value: null,
  },
  {
    key: 'config.daily-goal-options',
    description: 'Daily goal choices offered in Settings (minutes).',
    enabled: true,
    ...everyone,
    value: [5, 10, 20, 30],
  },
  {
    key: 'studio.media',
    description: 'Image library in the studio.',
    enabled: true,
    ...everyone,
    roles: ['writer', 'admin'],
    value: null,
  },
  {
    key: 'beta.review-nudges',
    description: 'Try-out: gentle nudges when reviews are waiting. Rolling out slowly.',
    enabled: true,
    ...everyone,
    rolloutPercent: 30,
    roles: ['student'],
    value: null,
  },
];
