/**
 * Every page of the web app, in one table (ADR-0019 §routing).
 *
 * - `src/app/` holds one Next.js page per row (a test checks they match exactly).
 * - The single-file demo build routes with the same rows (demo/routes.tsx), so the demo and
 *   the real site cannot drift apart.
 * - `shell` picks the layout; `access` is the guard (the API still enforces it).
 */

export type Shell = 'marketing' | 'auth' | 'student' | 'focus' | 'studio' | 'admin';
export type Access = 'public' | 'guest' | 'user' | 'writer' | 'admin';

export interface RouteRow {
  pattern: string;
  shell: Shell;
  /** public: anyone. guest: works signed out too (progress kept on the device). */
  access: Access;
}

export const ROUTE_TABLE = [
  // marketing
  { pattern: '/', shell: 'marketing', access: 'public' },
  { pattern: '/how-it-works', shell: 'marketing', access: 'public' },
  { pattern: '/developers', shell: 'marketing', access: 'public' },
  { pattern: '/legal/privacy', shell: 'marketing', access: 'public' },
  { pattern: '/legal/terms', shell: 'marketing', access: 'public' },
  // auth
  { pattern: '/login', shell: 'auth', access: 'public' },
  { pattern: '/signup', shell: 'auth', access: 'public' },
  { pattern: '/forgot-password', shell: 'auth', access: 'public' },
  { pattern: '/reset-password', shell: 'auth', access: 'public' },
  { pattern: '/verify-email', shell: 'auth', access: 'public' },
  { pattern: '/consent/:token', shell: 'auth', access: 'public' },
  // student
  { pattern: '/home', shell: 'student', access: 'guest' },
  { pattern: '/learn', shell: 'student', access: 'guest' },
  { pattern: '/leaderboard', shell: 'student', access: 'user' },
  { pattern: '/classes', shell: 'student', access: 'user' },
  { pattern: '/classes/join/:code', shell: 'student', access: 'user' },
  { pattern: '/search', shell: 'student', access: 'guest' },
  { pattern: '/notifications', shell: 'student', access: 'user' },
  { pattern: '/profile', shell: 'student', access: 'user' },
  { pattern: '/settings', shell: 'student', access: 'guest' },
  { pattern: '/settings/developer', shell: 'student', access: 'user' },
  // focus (full screen: nothing but the lesson)
  { pattern: '/learn/:concept', shell: 'focus', access: 'guest' },
  { pattern: '/review', shell: 'focus', access: 'guest' },
  // studio
  { pattern: '/studio', shell: 'studio', access: 'writer' },
  { pattern: '/studio/drafts', shell: 'studio', access: 'writer' },
  { pattern: '/studio/drafts/new', shell: 'studio', access: 'writer' },
  { pattern: '/studio/drafts/:id', shell: 'studio', access: 'writer' },
  { pattern: '/studio/drafts/:id/edit/:kind/:itemId', shell: 'studio', access: 'writer' },
  { pattern: '/studio/media', shell: 'studio', access: 'writer' },
  { pattern: '/studio/stats', shell: 'studio', access: 'writer' },
  // admin
  { pattern: '/admin', shell: 'admin', access: 'admin' },
  { pattern: '/admin/review', shell: 'admin', access: 'admin' },
  { pattern: '/admin/review/:id', shell: 'admin', access: 'admin' },
  { pattern: '/admin/content', shell: 'admin', access: 'admin' },
  { pattern: '/admin/users', shell: 'admin', access: 'admin' },
  { pattern: '/admin/users/:id', shell: 'admin', access: 'admin' },
  { pattern: '/admin/classes', shell: 'admin', access: 'admin' },
  { pattern: '/admin/flags', shell: 'admin', access: 'admin' },
  { pattern: '/admin/api-keys', shell: 'admin', access: 'admin' },
  { pattern: '/admin/media', shell: 'admin', access: 'admin' },
  { pattern: '/admin/audit', shell: 'admin', access: 'admin' },
] as const satisfies readonly RouteRow[];

export type RoutePattern = (typeof ROUTE_TABLE)[number]['pattern'];

export interface RouteMatch {
  row: RouteRow;
  params: Record<string, string>;
}

/** Finds the row for a path. Static segments beat parameters (/studio/drafts/new vs :id). */
export function matchRoute(path: string): RouteMatch | null {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  let best: { match: RouteMatch; score: number } | null = null;
  for (const row of ROUTE_TABLE as readonly RouteRow[]) {
    const segments = row.pattern.split('/').filter(Boolean);
    if (segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let score = 0;
    let ok = true;
    segments.forEach((segment, i) => {
      if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(parts[i]!);
      else if (segment === parts[i]) score += 1;
      else ok = false;
    });
    if (ok && (!best || score > best.score)) best = { match: { row, params }, score };
  }
  return best?.match ?? null;
}
