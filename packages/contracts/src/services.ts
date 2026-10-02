/** Every backend service. The gateway routes to them; the endpoint table names the owner. */
export const SERVICE_NAMES = [
  'identity',
  'profile',
  'consent',
  'content',
  'authoring',
  'practice',
  'progress',
  'review',
  'gamification',
  'notification',
  'analytics',
  'audit',
  'leaderboard',
  'classroom',
  'search',
  'media',
  'flags',
  'developer',
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
