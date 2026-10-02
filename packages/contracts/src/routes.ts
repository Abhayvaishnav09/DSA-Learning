import { z } from 'zod';
import { Id, Ok } from './common';
import * as authoring from './http/authoring';
import * as content from './http/content';
import * as engagement from './http/engagement';
import { Home } from './http/home';
import * as identity from './http/identity';
import * as learning from './http/learning';
import * as platform from './http/platform';
import * as profile from './http/profile';
import * as pub from './http/public';
import type { ServiceName } from './services';

/**
 * The public HTTP API as one typed table (ADR-0022, contract-first).
 *
 * - Clients (`@logicpath/api-client`, the Flutter client) call endpoints by id with full types.
 * - The in-browser demo backend implements the same ids.
 * - Each service's integration tests check that its OpenAPI matches its rows here, so the
 *   table and the running services cannot drift apart.
 */

import type { Auth, Method } from './route-types';

export type { Auth, Method } from './route-types';
export { pathFor } from './meta';

export interface Endpoint {
  method: Method;
  /** Fastify-style path, e.g. /v1/studio/drafts/:id */
  path: string;
  service: ServiceName | 'gateway';
  auth: Auth;
  summary: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** 'multipart' bodies are sent as FormData (file uploads). */
  bodyType?: 'json' | 'multipart';
  response: z.ZodType;
  status: number;
  /** Milestone that implements it, while the row is contract-only (the demo backend has it). */
  planned?: string;
}

const idParam = z.object({ id: Id });
const keyParam = z.object({ key: z.string() });
const conceptParam = z.object({ conceptId: z.string() });
const pageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const e = <const T extends Endpoint>(endpoint: T) => endpoint;

export const ENDPOINTS = {
  // ---------- identity ----------
  'auth.register': e({
    method: 'POST',
    path: '/v1/auth/register',
    service: 'identity',
    auth: 'public',
    summary: 'Create a student account',
    body: identity.RegisterRequest,
    response: identity.RegisterResponse,
    status: 201,
  }),
  'auth.login': e({
    method: 'POST',
    path: '/v1/auth/login',
    service: 'identity',
    auth: 'public',
    summary: 'Sign in',
    body: identity.LoginRequest,
    response: identity.Session,
    status: 200,
  }),
  'auth.refresh': e({
    method: 'POST',
    path: '/v1/auth/refresh',
    service: 'identity',
    auth: 'public',
    summary: 'New access token from a refresh token',
    body: identity.RefreshRequest.optional(),
    response: identity.Session,
    status: 200,
  }),
  'auth.logout': e({
    method: 'POST',
    path: '/v1/auth/logout',
    service: 'identity',
    auth: 'public',
    summary: 'Sign out (revokes the refresh token)',
    body: identity.RefreshRequest.optional(),
    response: Ok,
    status: 200,
  }),
  'auth.verifyEmail': e({
    method: 'POST',
    path: '/v1/auth/verify-email',
    service: 'identity',
    auth: 'public',
    summary: 'Confirm an email address',
    body: identity.TokenRequest,
    response: Ok,
    status: 200,
  }),
  'auth.forgotPassword': e({
    method: 'POST',
    path: '/v1/auth/password/forgot',
    service: 'identity',
    auth: 'public',
    summary: 'Email a reset link',
    body: identity.ForgotPasswordRequest,
    response: Ok,
    status: 202,
  }),
  'auth.resetPassword': e({
    method: 'POST',
    path: '/v1/auth/password/reset',
    service: 'identity',
    auth: 'public',
    summary: 'Set a new password',
    body: identity.ResetPasswordRequest,
    response: Ok,
    status: 200,
  }),
  'auth.me': e({
    method: 'GET',
    path: '/v1/auth/me',
    service: 'identity',
    auth: 'user',
    summary: 'The signed-in account',
    response: identity.User,
    status: 200,
  }),
  'admin.users.list': e({
    method: 'GET',
    path: '/v1/admin/users',
    service: 'identity',
    auth: 'admin',
    summary: 'Search users',
    query: identity.AdminUserQuery,
    response: identity.UserPage,
    status: 200,
  }),
  'admin.users.create': e({
    method: 'POST',
    path: '/v1/admin/users',
    service: 'identity',
    auth: 'admin',
    summary: 'Create a user with a role',
    body: identity.AdminCreateUser,
    response: identity.User,
    status: 201,
  }),
  'admin.users.update': e({
    method: 'PATCH',
    path: '/v1/admin/users/:id',
    service: 'identity',
    auth: 'admin',
    summary: 'Change role or suspend',
    params: idParam,
    body: identity.AdminUserUpdate,
    response: identity.User,
    status: 200,
  }),

  // ---------- profile ----------
  'profile.get': e({
    method: 'GET',
    path: '/v1/me/profile',
    service: 'profile',
    auth: 'user',
    summary: 'My profile and settings',
    response: profile.Profile,
    status: 200,
  }),
  'profile.update': e({
    method: 'PATCH',
    path: '/v1/me/profile',
    service: 'profile',
    auth: 'user',
    summary: 'Update my profile and settings',
    body: profile.ProfileUpdate,
    response: profile.Profile,
    status: 200,
  }),

  // ---------- content ----------
  'content.bundle': e({
    method: 'GET',
    path: '/v1/content/bundle',
    service: 'content',
    auth: 'public',
    summary: 'The published curriculum',
    response: content.Bundle,
    status: 200,
  }),
  'content.manifest': e({
    method: 'GET',
    path: '/v1/content/manifest',
    service: 'content',
    auth: 'public',
    summary: 'Which curriculum version is live',
    response: content.Manifest,
    status: 200,
  }),
  'admin.content.versions': e({
    method: 'GET',
    path: '/v1/admin/content/versions',
    service: 'content',
    auth: 'admin',
    summary: 'Published versions',
    query: pageQuery,
    response: content.VersionPage,
    status: 200,
  }),
  'admin.content.rollback': e({
    method: 'POST',
    path: '/v1/admin/content/versions/:id/rollback',
    service: 'content',
    auth: 'admin',
    summary: 'Restore an earlier version',
    params: idParam,
    body: content.RollbackRequest,
    response: content.Version,
    status: 200,
  }),

  // ---------- authoring ----------
  'studio.drafts.list': e({
    method: 'GET',
    path: '/v1/studio/drafts',
    service: 'authoring',
    auth: 'writer',
    summary: 'My drafts',
    query: authoring.DraftQuery,
    response: authoring.DraftPage,
    status: 200,
  }),
  'studio.drafts.create': e({
    method: 'POST',
    path: '/v1/studio/drafts',
    service: 'authoring',
    auth: 'writer',
    summary: 'Start a draft',
    body: authoring.CreateDraft,
    response: authoring.Draft,
    status: 201,
  }),
  'studio.drafts.get': e({
    method: 'GET',
    path: '/v1/studio/drafts/:id',
    service: 'authoring',
    auth: 'writer',
    summary: 'One draft',
    params: idParam,
    response: authoring.Draft,
    status: 200,
  }),
  'studio.drafts.update': e({
    method: 'PATCH',
    path: '/v1/studio/drafts/:id',
    service: 'authoring',
    auth: 'writer',
    summary: 'Edit a draft',
    params: idParam,
    body: authoring.UpdateDraft,
    response: authoring.Draft,
    status: 200,
  }),
  'studio.drafts.delete': e({
    method: 'DELETE',
    path: '/v1/studio/drafts/:id',
    service: 'authoring',
    auth: 'writer',
    summary: 'Delete a draft',
    params: idParam,
    response: Ok,
    status: 200,
  }),
  'studio.drafts.validate': e({
    method: 'POST',
    path: '/v1/studio/drafts/:id/validate',
    service: 'authoring',
    auth: 'writer',
    summary: 'Check against the live curriculum',
    params: idParam,
    response: authoring.Validation,
    status: 200,
  }),
  'studio.drafts.submit': e({
    method: 'POST',
    path: '/v1/studio/drafts/:id/submit',
    service: 'authoring',
    auth: 'writer',
    summary: 'Send for review',
    params: idParam,
    response: authoring.Draft,
    status: 200,
  }),
  'studio.drafts.withdraw': e({
    method: 'POST',
    path: '/v1/studio/drafts/:id/withdraw',
    service: 'authoring',
    auth: 'writer',
    summary: 'Take a submission back',
    params: idParam,
    response: authoring.Draft,
    status: 200,
  }),
  'admin.review.list': e({
    method: 'GET',
    path: '/v1/admin/review/submissions',
    service: 'authoring',
    auth: 'admin',
    summary: 'Submissions to review',
    query: authoring.DraftQuery,
    response: authoring.DraftPage,
    status: 200,
  }),
  'admin.review.get': e({
    method: 'GET',
    path: '/v1/admin/review/submissions/:id',
    service: 'authoring',
    auth: 'admin',
    summary: 'One submission',
    params: idParam,
    response: authoring.Draft,
    status: 200,
  }),
  'admin.review.approve': e({
    method: 'POST',
    path: '/v1/admin/review/submissions/:id/approve',
    service: 'authoring',
    auth: 'admin',
    summary: 'Approve and publish',
    params: idParam,
    body: authoring.ReviewDecision,
    response: authoring.Draft,
    status: 200,
  }),
  'admin.review.requestChanges': e({
    method: 'POST',
    path: '/v1/admin/review/submissions/:id/request-changes',
    service: 'authoring',
    auth: 'admin',
    summary: 'Send back with a comment',
    params: idParam,
    body: authoring.RequestChanges,
    response: authoring.Draft,
    status: 200,
  }),

  // ---------- practice / progress / review ----------
  'practice.attempt': e({
    method: 'POST',
    path: '/v1/practice/attempts',
    service: 'practice',
    auth: 'user',
    summary: 'Record and grade one attempt',
    body: learning.AttemptRequest,
    response: learning.AttemptResult,
    status: 200,
  }),
  'practice.sync': e({
    method: 'POST',
    path: '/v1/practice/sync',
    service: 'practice',
    auth: 'user',
    summary: 'Upload attempts made offline',
    body: learning.SyncRequest,
    response: learning.SyncResult,
    status: 200,
  }),
  'progress.get': e({
    method: 'GET',
    path: '/v1/progress',
    service: 'progress',
    auth: 'user',
    summary: 'Mastery, lessons, streak and today',
    response: learning.ProgressMap,
    status: 200,
  }),
  'progress.lesson.position': e({
    method: 'PUT',
    path: '/v1/progress/lessons/:conceptId',
    service: 'progress',
    auth: 'user',
    summary: 'Save where I am in a lesson',
    params: conceptParam,
    body: learning.LessonPosition,
    response: learning.LessonState,
    status: 200,
  }),
  'progress.lesson.complete': e({
    method: 'POST',
    path: '/v1/progress/lessons/:conceptId/complete',
    service: 'progress',
    auth: 'user',
    summary: 'Finish a lesson',
    params: conceptParam,
    response: learning.LessonState,
    status: 200,
  }),
  'reviews.due': e({
    method: 'GET',
    path: '/v1/reviews/due',
    service: 'review',
    auth: 'user',
    summary: 'Cards due now',
    query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
    response: learning.DueQueue,
    status: 200,
  }),
  'reviews.summary': e({
    method: 'GET',
    path: '/v1/reviews/summary',
    service: 'review',
    auth: 'user',
    summary: 'How much review is waiting',
    response: learning.ReviewSummary,
    status: 200,
  }),

  // ---------- engagement ----------
  'rewards.me': e({
    method: 'GET',
    path: '/v1/rewards/me',
    service: 'gamification',
    auth: 'user',
    summary: 'XP, level and badges',
    response: engagement.Rewards,
    status: 200,
  }),
  'rewards.badges': e({
    method: 'GET',
    path: '/v1/rewards/badges',
    service: 'gamification',
    auth: 'public',
    summary: 'Every badge there is',
    response: z.object({ items: z.array(engagement.Badge) }),
    status: 200,
  }),
  'leaderboard.league': e({
    method: 'GET',
    path: '/v1/leaderboard/league',
    service: 'leaderboard',
    auth: 'user',
    summary: 'My league this week',
    response: engagement.League,
    status: 200,
  }),
  'leaderboard.history': e({
    method: 'GET',
    path: '/v1/leaderboard/history',
    service: 'leaderboard',
    auth: 'user',
    summary: 'My past weeks',
    response: engagement.LeagueHistory,
    status: 200,
  }),
  'classes.mine': e({
    method: 'GET',
    path: '/v1/classes',
    service: 'classroom',
    auth: 'user',
    summary: 'Classes I am in or own',
    response: engagement.ClassList,
    status: 200,
  }),
  'classes.join': e({
    method: 'POST',
    path: '/v1/classes/join',
    service: 'classroom',
    auth: 'user',
    summary: 'Join with a code',
    body: engagement.JoinClass,
    response: engagement.ClassSummary,
    status: 200,
  }),
  'classes.get': e({
    method: 'GET',
    path: '/v1/classes/:id',
    service: 'classroom',
    auth: 'user',
    summary: 'One class (roster for the owner)',
    params: idParam,
    response: engagement.ClassDetail,
    status: 200,
  }),
  'classes.leave': e({
    method: 'DELETE',
    path: '/v1/classes/:id/membership',
    service: 'classroom',
    auth: 'user',
    summary: 'Leave a class',
    params: idParam,
    response: Ok,
    status: 200,
  }),
  'admin.classes.list': e({
    method: 'GET',
    path: '/v1/admin/classes',
    service: 'classroom',
    auth: 'admin',
    summary: 'All classes',
    query: pageQuery,
    response: engagement.ClassPage,
    status: 200,
  }),
  'admin.classes.create': e({
    method: 'POST',
    path: '/v1/admin/classes',
    service: 'classroom',
    auth: 'admin',
    summary: 'Create a class',
    body: engagement.CreateClass,
    response: engagement.ClassSummary,
    status: 201,
  }),
  'admin.classes.newCode': e({
    method: 'POST',
    path: '/v1/admin/classes/:id/code',
    service: 'classroom',
    auth: 'admin',
    summary: 'Replace the join code',
    params: idParam,
    response: engagement.ClassSummary,
    status: 200,
  }),
  'admin.classes.delete': e({
    method: 'DELETE',
    path: '/v1/admin/classes/:id',
    service: 'classroom',
    auth: 'admin',
    summary: 'Delete a class',
    params: idParam,
    response: Ok,
    status: 200,
  }),
  'notifications.list': e({
    method: 'GET',
    path: '/v1/notifications',
    service: 'notification',
    auth: 'user',
    summary: 'My inbox',
    query: pageQuery,
    response: engagement.NotificationPage,
    status: 200,
  }),
  'notifications.read': e({
    method: 'POST',
    path: '/v1/notifications/:id/read',
    service: 'notification',
    auth: 'user',
    summary: 'Mark as read',
    params: idParam,
    response: Ok,
    status: 200,
  }),
  'notifications.readAll': e({
    method: 'POST',
    path: '/v1/notifications/read-all',
    service: 'notification',
    auth: 'user',
    summary: 'Mark all as read',
    response: Ok,
    status: 200,
  }),
  'notifications.prefs': e({
    method: 'GET',
    path: '/v1/notifications/preferences',
    service: 'notification',
    auth: 'user',
    summary: 'Email preferences',
    response: engagement.NotificationPrefs,
    status: 200,
  }),
  'notifications.setPrefs': e({
    method: 'PUT',
    path: '/v1/notifications/preferences',
    service: 'notification',
    auth: 'user',
    summary: 'Change email preferences',
    body: engagement.NotificationPrefs,
    response: engagement.NotificationPrefs,
    status: 200,
  }),

  // ---------- consent & privacy ----------
  'consent.request': e({
    method: 'GET',
    path: '/v1/consent/requests/:token',
    service: 'consent',
    auth: 'public',
    summary: 'What a parent is asked to approve',
    params: z.object({ token: z.string() }),
    response: platform.ConsentRequest,
    status: 200,
  }),
  'consent.respond': e({
    method: 'POST',
    path: '/v1/consent/respond',
    service: 'consent',
    auth: 'public',
    summary: 'Parent approves or declines',
    body: platform.ConsentDecision,
    response: platform.ConsentRequest,
    status: 200,
  }),
  'privacy.export': e({
    method: 'GET',
    path: '/v1/privacy/export',
    service: 'consent',
    auth: 'user',
    summary: 'Download all my data',
    response: platform.DataExport,
    status: 200,
  }),
  'privacy.delete': e({
    method: 'DELETE',
    path: '/v1/privacy/me',
    service: 'consent',
    auth: 'user',
    summary: 'Delete my account and data',
    response: platform.DeletionStatus,
    status: 202,
  }),
  'privacy.deletion': e({
    method: 'GET',
    path: '/v1/privacy/deletions/:id',
    service: 'consent',
    auth: 'public',
    summary: 'Deletion progress',
    params: idParam,
    response: platform.DeletionStatus,
    status: 200,
  }),
  'admin.consent.list': e({
    method: 'GET',
    path: '/v1/admin/consent',
    service: 'consent',
    auth: 'admin',
    summary: 'Parental consent requests',
    query: pageQuery,
    response: platform.PendingConsentPage,
    status: 200,
  }),

  // ---------- analytics & audit ----------
  'admin.analytics.overview': e({
    method: 'GET',
    path: '/v1/admin/analytics/overview',
    service: 'analytics',
    auth: 'admin',
    summary: 'Dashboard numbers',
    query: z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }),
    response: platform.AdminOverview,
    status: 200,
  }),
  'studio.analytics.items': e({
    method: 'GET',
    path: '/v1/studio/analytics/items',
    service: 'analytics',
    auth: 'writer',
    summary: 'How questions perform',
    query: z.object({ conceptId: z.string().optional() }),
    response: platform.ItemStats,
    status: 200,
  }),
  'admin.audit.list': e({
    method: 'GET',
    path: '/v1/admin/audit',
    service: 'audit',
    auth: 'admin',
    summary: 'Audit log',
    query: platform.AuditQuery,
    response: platform.AuditPage,
    status: 200,
  }),

  // ---------- search, media, flags ----------
  'search.query': e({
    method: 'GET',
    path: '/v1/search',
    service: 'search',
    auth: 'public',
    summary: 'Search the curriculum',
    query: platform.SearchQuery,
    response: platform.SearchResults,
    status: 200,
  }),
  'studio.media.upload': e({
    method: 'POST',
    path: '/v1/studio/media',
    service: 'media',
    auth: 'writer',
    summary: 'Upload an image (multipart: file, alt)',
    bodyType: 'multipart',
    body: z.instanceof(FormData),
    response: platform.MediaAsset,
    status: 201,
  }),
  'studio.media.list': e({
    method: 'GET',
    path: '/v1/studio/media',
    service: 'media',
    auth: 'writer',
    summary: 'Image library',
    query: pageQuery,
    response: platform.MediaPage,
    status: 200,
  }),
  'studio.media.delete': e({
    method: 'DELETE',
    path: '/v1/studio/media/:id',
    service: 'media',
    auth: 'writer',
    summary: 'Delete an image',
    params: idParam,
    response: Ok,
    status: 200,
  }),
  'flags.evaluate': e({
    method: 'GET',
    path: '/v1/flags',
    service: 'flags',
    auth: 'public',
    summary: 'Flags for me on this platform',
    query: platform.FlagsQuery,
    response: platform.EvaluatedFlags,
    status: 200,
  }),
  'admin.flags.list': e({
    method: 'GET',
    path: '/v1/admin/flags',
    service: 'flags',
    auth: 'admin',
    summary: 'All flags',
    response: platform.FlagList,
    status: 200,
  }),
  'admin.flags.put': e({
    method: 'PUT',
    path: '/v1/admin/flags/:key',
    service: 'flags',
    auth: 'admin',
    summary: 'Create or change a flag',
    params: keyParam,
    body: platform.FlagChange,
    response: platform.Flag,
    status: 200,
  }),
  'admin.flags.delete': e({
    method: 'DELETE',
    path: '/v1/admin/flags/:key',
    service: 'flags',
    auth: 'admin',
    summary: 'Delete a flag',
    params: keyParam,
    response: Ok,
    status: 200,
  }),

  // ---------- developer platform ----------
  'developer.keys.list': e({
    method: 'GET',
    path: '/v1/developer/keys',
    service: 'developer',
    auth: 'user',
    summary: 'My API keys',
    response: platform.ApiKeyList,
    status: 200,
  }),
  'developer.keys.create': e({
    method: 'POST',
    path: '/v1/developer/keys',
    service: 'developer',
    auth: 'user',
    summary: 'Create an API key (shown once)',
    body: platform.CreateApiKey,
    response: platform.CreatedApiKey,
    status: 201,
  }),
  'developer.keys.revoke': e({
    method: 'DELETE',
    path: '/v1/developer/keys/:id',
    service: 'developer',
    auth: 'user',
    summary: 'Revoke an API key',
    params: idParam,
    response: Ok,
    status: 200,
  }),
  'developer.keys.usage': e({
    method: 'GET',
    path: '/v1/developer/keys/:id/usage',
    service: 'developer',
    auth: 'user',
    summary: 'Requests per day',
    params: idParam,
    response: platform.ApiKeyUsage,
    status: 200,
  }),
  'admin.apiKeys.list': e({
    method: 'GET',
    path: '/v1/admin/api-keys',
    service: 'developer',
    auth: 'admin',
    summary: 'Every API key',
    query: pageQuery,
    response: platform.ApiKeyPage,
    status: 200,
  }),
  'admin.apiKeys.update': e({
    method: 'PATCH',
    path: '/v1/admin/api-keys/:id',
    service: 'developer',
    auth: 'admin',
    summary: 'Change plan or quota',
    params: idParam,
    body: platform.AdminApiKeyUpdate,
    response: platform.ApiKey,
    status: 200,
  }),
  'admin.apiKeys.revoke': e({
    method: 'POST',
    path: '/v1/admin/api-keys/:id/revoke',
    service: 'developer',
    auth: 'admin',
    summary: 'Revoke any key',
    params: idParam,
    response: Ok,
    status: 200,
  }),

  // ---------- public API (API key) ----------
  'public.curriculum': e({
    method: 'GET',
    path: '/public/v1/curriculum',
    service: 'content',
    auth: 'apiKey',
    planned: 'M9',
    summary: 'Stages and concepts',
    response: pub.PublicCurriculum,
    status: 200,
  }),
  'public.concept': e({
    method: 'GET',
    path: '/public/v1/concepts/:id',
    service: 'content',
    auth: 'apiKey',
    planned: 'M9',
    summary: 'One concept and its lesson',
    params: z.object({ id: z.string() }),
    response: pub.PublicLesson,
    status: 200,
  }),
  'public.items': e({
    method: 'GET',
    path: '/public/v1/items',
    service: 'content',
    auth: 'apiKey',
    planned: 'M9',
    summary: 'Questions for a concept (no answers)',
    query: z.object({ concept: z.string() }),
    response: pub.PublicItemList,
    status: 200,
  }),

  // ---------- gateway ----------
  home: e({
    method: 'GET',
    path: '/v1/home',
    service: 'gateway',
    auth: 'user',
    summary: 'Everything the dashboard needs, in one call',
    response: Home,
    status: 200,
  }),
} satisfies Record<string, Endpoint>;

export type Endpoints = typeof ENDPOINTS;
export type EndpointId = keyof Endpoints;

type InputOf<S> = S extends z.ZodType ? z.input<S> : never;
export type ParamsOf<K extends EndpointId> = Endpoints[K] extends { params: infer S }
  ? InputOf<S>
  : undefined;
export type QueryOf<K extends EndpointId> = Endpoints[K] extends { query: infer S }
  ? InputOf<S>
  : undefined;
export type BodyOf<K extends EndpointId> = Endpoints[K] extends { body: infer S }
  ? InputOf<S>
  : undefined;
export type ResponseOf<K extends EndpointId> = z.output<Endpoints[K]['response']>;

/** Implemented rows owned by one service, as "METHOD path" (used by the contract tests). */
export function routesOf(service: ServiceName | 'gateway'): string[] {
  return Object.values(ENDPOINTS as Record<string, Endpoint>)
    .filter((endpoint) => endpoint.service === service && !endpoint.planned)
    .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
    .sort();
}
