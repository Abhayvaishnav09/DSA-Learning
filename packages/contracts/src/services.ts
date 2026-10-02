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

/** Where each service listens by default (a laptop; containers override with `<NAME>_URL`). */
export const DEFAULT_PORTS: Record<ServiceName, number> = {
  identity: 4101,
  profile: 4102,
  consent: 4103,
  content: 4104,
  authoring: 4105,
  practice: 4106,
  progress: 4107,
  review: 4108,
  gamification: 4109,
  notification: 4110,
  analytics: 4111,
  audit: 4112,
  leaderboard: 4113,
  classroom: 4114,
  search: 4115,
  media: 4116,
  flags: 4117,
  developer: 4118,
};

/**
 * Services that keep personal data. Each answers `GET /internal/users/:id/export` (the privacy
 * export) and, on `privacy.deletion.requested`, erases what it holds and says so with
 * `privacy.deletion.completed`. The consent service waits for all of them (and for itself).
 */
export const PRIVACY_SERVICES = [
  'identity',
  'profile',
  'authoring',
  'practice',
  'progress',
  'review',
  'gamification',
  'leaderboard',
  'classroom',
  'notification',
  'analytics',
  'developer',
  'media',
  'audit',
] as const satisfies readonly ServiceName[];
