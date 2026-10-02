import { ApiError, fail, problem, type LocalContext, type LocalUser } from '@logicpath/api-client';
import type { Role } from '@logicpath/contracts';
import type { LocalDb } from './db';

export const uuid = () => crypto.randomUUID();
export const iso = (d: Date) => d.toISOString();

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const randomToken = (prefix: string) => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `${prefix}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};

export const notFound = (what: string) =>
  fail(404, 'Not found', `${what} was not found`, 'not-found');
export const conflict = (detail: string) => fail(409, 'Conflict', detail, 'conflict');
export const forbidden = (detail = 'You do not have permission to do this') =>
  fail(403, 'Forbidden', detail, 'forbidden');
export const badRequest = (detail: string) => fail(400, 'Bad request', detail, 'request');

/** The signed-in user (the transport already enforced the endpoint's auth level). */
export const me = (ctx: LocalContext): LocalUser => {
  if (!ctx.user) throw fail(401, 'Unauthorized', 'Sign in to continue', 'unauthorized');
  return ctx.user;
};

/** Keyset-style pages over an already sorted array, with an opaque cursor (the offset). */
export function paginate<T>(rows: T[], query: { cursor?: unknown; limit?: unknown }) {
  const limit = Number(query.limit ?? 20);
  const start = query.cursor ? Number(atob(String(query.cursor))) : 0;
  const items = rows.slice(start, start + limit);
  const next = start + limit;
  return { items, nextCursor: next < rows.length ? btoa(String(next)) : null };
}

export function audit(
  db: LocalDb,
  actor: { id: string; role: Role } | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
  now: Date,
) {
  db.t.audit.unshift({
    id: uuid(),
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action,
    targetType,
    targetId,
    details,
    at: iso(now),
  });
}

/** 400 with field errors, the same shape the services send. */
export const invalid = (detail: string, errors: { path: string; message: string }[]) =>
  new ApiError({ ...problem(400, 'Invalid request', detail, 'validation'), errors });
