import { DEFAULT_PORTS, SERVICE_NAMES, type ServiceName } from '@logicpath/contracts';

export { DEFAULT_PORTS, SERVICE_NAMES, type ServiceName };

/** Public path prefix → owning service. The longest matching prefix wins. */
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
  { prefix: '/public/v1', service: 'content' },
  { prefix: '/v1/studio/analytics', service: 'analytics' },
  { prefix: '/v1/studio/media', service: 'media' },
  { prefix: '/media', service: 'media' },
  { prefix: '/v1/studio', service: 'authoring' },
  { prefix: '/v1/admin/review', service: 'authoring' },
  { prefix: '/v1/practice', service: 'practice' },
  { prefix: '/v1/progress', service: 'progress' },
  { prefix: '/v1/reviews', service: 'review' },
  { prefix: '/v1/rewards', service: 'gamification' },
  { prefix: '/v1/leaderboard', service: 'leaderboard' },
  { prefix: '/v1/classes', service: 'classroom' },
  { prefix: '/v1/admin/classes', service: 'classroom' },
  { prefix: '/v1/notifications', service: 'notification' },
  { prefix: '/v1/admin/analytics', service: 'analytics' },
  { prefix: '/v1/admin/audit', service: 'audit' },
  { prefix: '/v1/search', service: 'search' },
  { prefix: '/v1/flags', service: 'flags' },
  { prefix: '/v1/admin/flags', service: 'flags' },
  { prefix: '/v1/developer', service: 'developer' },
  { prefix: '/v1/admin/api-keys', service: 'developer' },
];

/** The service that owns a path (longest prefix on a segment boundary), or null. */
export function ownerOf(path: string): ServiceName | null {
  let best: { prefix: string; service: ServiceName } | null = null;
  for (const route of ROUTES) {
    const matches = path === route.prefix || path.startsWith(`${route.prefix}/`);
    if (matches && (!best || route.prefix.length > best.prefix.length)) best = route;
  }
  return best?.service ?? null;
}

/** Stricter limits on endpoints attackers like (credential stuffing, email bombing). */
export const SENSITIVE_PATHS = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/password/forgot',
  '/v1/auth/password/reset',
  '/v1/consent/respond',
]);
