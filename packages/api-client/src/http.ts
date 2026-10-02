import type { identity } from '@logicpath/contracts';
import { pathFor, type Endpoint, type EndpointId, type Problem } from '@logicpath/contracts';
import { ApiError, problem, type RequestInput, type Transport } from './client';

/** Where tokens live: memory on the web (the refresh token is an httpOnly cookie), secure storage on mobile. */
export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  save(tokens: identity.Tokens): void;
  clear(): void;
}

export function memoryTokenStore(): TokenStore {
  let access: string | null = null;
  let refresh: string | null = null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    save: (tokens) => {
      access = tokens.accessToken;
      refresh = tokens.refreshToken ?? refresh;
    },
    clear: () => {
      access = null;
      refresh = null;
    },
  };
}

export interface HttpOptions {
  baseUrl: string;
  tokens?: TokenStore;
  /** 'web' uses the httpOnly refresh cookie (credentials: include). */
  client?: 'web' | 'mobile';
  /** Called when the session can't be refreshed (sign the user out in the UI). */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
}

function queryString(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Talks to the API gateway. Refreshes the access token once on 401 and retries. */
export function httpTransport(options: HttpOptions): Transport {
  const tokens = options.tokens ?? memoryTokenStore();
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const isWeb = (options.client ?? 'web') === 'web';
  let refreshing: Promise<boolean> | null = null;

  async function send(endpoint: Endpoint, input: RequestInput): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (isWeb) headers['x-client'] = 'web';
    const access = tokens.getAccessToken();
    if (access) headers.authorization = `Bearer ${access}`;
    let body: BodyInit | undefined;
    if (input.body instanceof FormData) body = input.body;
    else if (input.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(input.body);
    }
    const url = `${options.baseUrl}${pathFor(endpoint.path, input.params)}${queryString(input.query)}`;
    return doFetch(url, {
      method: endpoint.method,
      headers,
      body,
      credentials: isWeb ? 'include' : 'omit',
      signal: input.signal,
    });
  }

  /** One refresh at a time, shared by every request that hit a 401 meanwhile. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const res = await doFetch(`${options.baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(isWeb ? { 'x-client': 'web' } : {}) },
          body: JSON.stringify(
            isWeb ? {} : { refreshToken: tokens.getRefreshToken() ?? undefined },
          ),
          credentials: isWeb ? 'include' : 'omit',
        });
        if (!res.ok) return false;
        const session = (await res.json()) as identity.Session;
        tokens.save(session.tokens);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  return {
    async request(id: EndpointId, endpoint, input) {
      let res: Response;
      try {
        res = await send(endpoint, input);
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        throw new ApiError(
          problem(0, 'You seem to be offline', 'Check your connection and try again', 'network'),
        );
      }
      if (res.status === 401 && endpoint.auth !== 'public' && id !== 'auth.refresh') {
        if (await refresh()) res = await send(endpoint, input);
        else {
          tokens.clear();
          options.onSessionExpired?.();
        }
      }
      if (res.status === 204 || res.status === 304) return null;
      const text = await res.text();
      const data: unknown = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new ApiError(
          (data as Problem | null)?.title
            ? (data as Problem)
            : problem(res.status, res.statusText || 'Request failed'),
        );
      }
      // Sessions carry tokens: keep them so later calls are signed in.
      if (
        id === 'auth.login' ||
        id === 'auth.refresh' ||
        (id === 'auth.register' && (data as { tokens?: unknown }).tokens)
      ) {
        tokens.save((data as identity.Session).tokens);
      }
      if (id === 'auth.logout') tokens.clear();
      return data;
    },
  };
}
