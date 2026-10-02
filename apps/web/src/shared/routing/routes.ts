/** Typed links: every href in the app comes from here, never from string literals. */
const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  return s ? `?${s}` : '';
};
const seg = encodeURIComponent;

export const routes = {
  landing: '/',
  howItWorks: '/how-it-works',
  developers: '/developers',
  privacy: '/legal/privacy',
  terms: '/legal/terms',

  login: (next?: string) => `/login${q({ next })}`,
  signup: (next?: string) => `/signup${q({ next })}`,
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  consent: (token: string) => `/consent/${seg(token)}`,

  home: '/home',
  learn: '/learn',
  concept: (id: string) => `/learn${q({ concept: id })}`,
  lesson: (id: string) => `/learn/${seg(id)}`,
  review: '/review',
  leaderboard: '/leaderboard',
  classes: '/classes',
  joinClass: (code: string) => `/classes/join/${seg(code)}`,
  search: (query?: string) => `/search${q({ q: query })}`,
  notifications: '/notifications',
  profile: '/profile',
  settings: '/settings',
  developerSettings: '/settings/developer',

  studio: '/studio',
  drafts: '/studio/drafts',
  newDraft: '/studio/drafts/new',
  draft: (id: string) => `/studio/drafts/${seg(id)}`,
  editInDraft: (id: string, kind: string, itemId: string) =>
    `/studio/drafts/${seg(id)}/edit/${seg(kind)}/${seg(itemId)}`,
  newInDraft: (id: string, kind: string, params: { type?: string; concept?: string } = {}) =>
    `/studio/drafts/${seg(id)}/edit/${seg(kind)}/new${q(params)}`,
  studioMedia: '/studio/media',
  studioStats: '/studio/stats',

  admin: '/admin',
  adminReview: '/admin/review',
  adminSubmission: (id: string) => `/admin/review/${seg(id)}`,
  adminContent: '/admin/content',
  adminUsers: '/admin/users',
  adminUser: (id: string) => `/admin/users/${seg(id)}`,
  adminClasses: '/admin/classes',
  adminFlags: '/admin/flags',
  adminApiKeys: '/admin/api-keys',
  adminMedia: '/admin/media',
  adminAudit: '/admin/audit',
} as const;
