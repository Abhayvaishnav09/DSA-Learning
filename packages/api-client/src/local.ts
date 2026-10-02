import {
  ENDPOINTS,
  pathFor,
  type Endpoint,
  type EndpointId,
  type Role,
} from '@logicpath/contracts';
import type { EndpointMeta } from '@logicpath/contracts/meta';
import { z } from 'zod';
import { ApiError, problem, type RequestInput, type Transport } from './client';
import { memoryTokenStore, type TokenStore } from './http';

export interface LocalUser {
  id: string;
  role: Role;
  name: string;
}

export interface LocalContext {
  user: LocalUser | null;
  now: Date;
  /** The access token used for this call (handlers that rotate sessions need it). */
  token: string | null;
}

export interface LocalInput {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
}

export type LocalHandler = (ctx: LocalContext, input: LocalInput) => unknown;

/** An in-browser backend: one handler per endpoint id, plus token → user lookup. */
export interface LocalBackend {
  handlers: Partial<Record<EndpointId, LocalHandler>>;
  authenticate(token: string): LocalUser | null;
}

export interface LocalOptions {
  backend: LocalBackend;
  tokens?: TokenStore;
  /** Simulated network delay, so loading states are visible in the demo. */
  latencyMs?: number;
  /** Check every response against the contract (on in tests and dev). */
  validateResponses?: boolean;
  now?: () => Date;
}

/** Minimum rank per endpoint auth level ('user' means any signed-in role). */
const RANK: Record<Role | 'user', number> = { user: 1, student: 1, writer: 2, admin: 3 };

const fail = (status: number, title: string, detail?: string, slug?: string) =>
  new ApiError(problem(status, title, detail, slug));

/** Same validation and error shape as the services (RFC 9457 with field paths). */
function parse<T>(schema: z.ZodType<T> | undefined, value: unknown, where: string): T {
  if (!schema) return value as T;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiError({
    ...problem(400, 'Invalid request', 'Some fields are missing or invalid', 'validation'),
    errors: result.error.issues.map((issue) => ({
      path: [where, ...issue.path].join('.'),
      message: issue.message,
    })),
  });
}

/**
 * Runs the API inside the page (guest mode and the demo link): same endpoint table, same
 * validation, same auth rules and error shapes as the real services, so the UI can't tell.
 */
export function localTransport(options: LocalOptions): Transport {
  const tokens = options.tokens ?? memoryTokenStore();
  const now = options.now ?? (() => new Date());

  return {
    async request(id: EndpointId, _meta: EndpointMeta, input: RequestInput) {
      // The full row, with schemas: the local backend validates like the services do.
      const endpoint = (ENDPOINTS as Record<string, Endpoint>)[id]!;
      if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));
      if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const token = tokens.getAccessToken();
      const user = token ? options.backend.authenticate(token) : null;
      if (endpoint.auth === 'apiKey')
        throw fail(401, 'API key required', 'The public API needs an X-API-Key header');
      if (endpoint.auth !== 'public') {
        if (!user) throw fail(401, 'Unauthorized', 'Sign in to continue', 'unauthorized');
        if (RANK[user.role] < RANK[endpoint.auth]) {
          throw fail(403, 'Forbidden', 'You do not have permission to do this', 'forbidden');
        }
      }

      const handler = options.backend.handlers[id];
      if (!handler) {
        throw fail(
          501,
          'Not available offline',
          `${endpoint.method} ${pathFor(endpoint.path, input.params)} has no local implementation`,
        );
      }

      const parsed: LocalInput = {
        params: parse(endpoint.params, input.params ?? {}, 'params') as Record<string, string>,
        query: parse(endpoint.query, input.query ?? {}, 'querystring') as Record<string, unknown>,
        body:
          endpoint.bodyType === 'multipart' ? input.body : parse(endpoint.body, input.body, 'body'),
      };

      // Copy so handlers can't hand out references to their stored objects.
      const result: unknown = structuredClone(await handler({ user, now: now(), token }, parsed));
      if (options.validateResponses) {
        const check = endpoint.response.safeParse(result);
        if (!check.success) {
          throw new Error(
            `local ${id} returned a response that breaks the contract: ${z.prettifyError(check.error)}`,
          );
        }
      }
      const data = result as { tokens?: Parameters<TokenStore['save']>[0] } | null;
      if (
        data?.tokens &&
        (id === 'auth.login' || id === 'auth.register' || id === 'auth.refresh')
      ) {
        tokens.save(data.tokens);
      }
      if (id === 'auth.logout') tokens.clear();
      return result;
    },
  };
}

export { fail };
