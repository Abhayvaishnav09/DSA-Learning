/** Public path prefix → owning service. More specific prefixes win (router static-segment priority). */
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
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export const ROUTES: { prefix: string; service: ServiceName }[] = [
  { prefix: '/v1/auth', service: 'identity' },
  { prefix: '/v1/admin/users', service: 'identity' },
  { prefix: '/.well-known', service: 'identity' },
  { prefix: '/v1/me/profile', service: 'profile' },
  { prefix: '/v1/consent', service: 'consent' },
  { prefix: '/v1/privacy', service: 'consent' },
  { prefix: '/v1/admin/consent', service: 'consent' },
  { prefix: '/v1/content', service: 'content' },
  { prefix: '/v1/admin/content', service: 'content' },
  { prefix: '/v1/studio/analytics', service: 'analytics' },
  { prefix: '/v1/studio', service: 'authoring' },
  { prefix: '/v1/admin/review', service: 'authoring' },
  { prefix: '/v1/practice', service: 'practice' },
  { prefix: '/v1/progress', service: 'progress' },
  { prefix: '/v1/reviews', service: 'review' },
  { prefix: '/v1/rewards', service: 'gamification' },
  { prefix: '/v1/notifications', service: 'notification' },
  { prefix: '/v1/admin/analytics', service: 'analytics' },
  { prefix: '/v1/admin/audit', service: 'audit' },
];

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
};

/** Stricter limits on endpoints attackers like (credential stuffing, email bombing). */
export const SENSITIVE_PATHS = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/password/forgot',
  '/v1/auth/password/reset',
  '/v1/consent/respond',
]);
