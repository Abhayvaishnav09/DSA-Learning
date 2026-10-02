import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createClient,
  httpTransport,
  localTransport,
  memoryTokenStore,
  type LocalBackend,
} from './index';

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@b.co',
  name: 'Asha',
  role: 'student',
  status: 'active',
  emailVerified: true,
  createdAt: new Date().toISOString(),
};
const session = (token: string) => ({ user, tokens: { accessToken: token, expiresIn: 900 } });

describe('http transport', () => {
  it('builds the URL, sends the token and parses JSON', async () => {
    const fetch = vi.fn(async () => json(200, { items: [], nextCursor: null }));
    const tokens = memoryTokenStore();
    tokens.save({ accessToken: 'abc', expiresIn: 900 });
    const api = createClient(httpTransport({ baseUrl: 'https://api.test', tokens, fetch }));
    await api.call('studio.drafts.list', {
      query: { status: 'draft', limit: 5, cursor: undefined },
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/studio/drafts?status=draft&limit=5');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer abc');
    expect((init.headers as Record<string, string>)['x-client']).toBe('web');
    expect(init.credentials).toBe('include');
  });

  it('refreshes once on 401, retries, and keeps the new token', async () => {
    const tokens = memoryTokenStore();
    tokens.save({ accessToken: 'old', expiresIn: 900 });
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/refresh')) return json(200, session('new'));
      const auth = (init.headers as Record<string, string>).authorization;
      return auth === 'Bearer new'
        ? json(200, user)
        : json(401, { type: 'x', title: 'Unauthorized', status: 401 });
    });
    const api = createClient(httpTransport({ baseUrl: '', tokens, fetch: fetch as never }));
    const [a, b] = await Promise.all([api.call('auth.me'), api.call('auth.me')]);
    expect(a.name).toBe('Asha');
    expect(b.name).toBe('Asha');
    expect(fetch.mock.calls.filter(([u]) => String(u).endsWith('/refresh'))).toHaveLength(1);
    expect(tokens.getAccessToken()).toBe('new');
  });

  it('signs out when the refresh fails, and turns problems into ApiError', async () => {
    const onSessionExpired = vi.fn();
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/refresh')
        ? json(401, { type: 'x', title: 'Unauthorized', status: 401 })
        : json(401, {
            type: 'x',
            title: 'Unauthorized',
            status: 401,
            detail: 'Sign in to continue',
          }),
    );
    const api = createClient(
      httpTransport({ baseUrl: '', fetch: fetch as never, onSessionExpired }),
    );
    await expect(api.call('auth.me')).rejects.toMatchObject({
      status: 401,
      message: 'Sign in to continue',
    });
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('maps validation errors to form fields', async () => {
    const fetch = vi.fn(async () =>
      json(400, {
        type: 'x',
        title: 'Invalid request',
        status: 400,
        errors: [{ path: 'body.email', message: 'Invalid email' }],
      }),
    );
    const api = createClient(httpTransport({ baseUrl: '', fetch: fetch as never }));
    const error = await api
      .call('auth.login', { body: { email: 'x', password: 'y' } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldErrors()).toEqual({ email: 'Invalid email' });
  });
});

describe('local transport', () => {
  const backend: LocalBackend = {
    authenticate: (token) =>
      token === 'student-token' ? { id: user.id, role: 'student', name: 'Asha' } : null,
    handlers: {
      'auth.login': () => session('student-token'),
      'auth.me': () => user,
      'profile.update': () => ({ broken: true }),
    },
  };

  it('validates input like the server, with the same field paths', async () => {
    const api = createClient(localTransport({ backend }));
    const error = (await api
      .call('auth.login', { body: { email: 'nope', password: '' } })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(Object.keys(error.fieldErrors()).sort()).toEqual(['email', 'password']);
  });

  it('enforces auth and roles, and keeps the session after login', async () => {
    const api = createClient(localTransport({ backend }));
    await expect(api.call('auth.me')).rejects.toMatchObject({ status: 401 });
    await api.call('auth.login', { body: { email: 'a@b.co', password: 'x' } });
    expect((await api.call('auth.me')).name).toBe('Asha');
    await expect(api.call('admin.users.list')).rejects.toMatchObject({ status: 403 });
    await expect(api.call('rewards.badges')).rejects.toMatchObject({ status: 501 });
  });

  it('catches handlers that break the contract', async () => {
    const tokens = memoryTokenStore();
    tokens.save({ accessToken: 'student-token', expiresIn: 900 });
    const api = createClient(localTransport({ backend, tokens, validateResponses: true }));
    await expect(api.call('profile.update', { body: {} })).rejects.toThrow(/breaks the contract/);
  });
});

describe('types', () => {
  it('requires path params where the path has them', () => {
    const api = createClient(
      localTransport({ backend: { handlers: {}, authenticate: () => null } }),
    );
    // @ts-expect-error params are required for this endpoint
    void api.call('studio.drafts.get').catch(() => {});
    void api.call('studio.drafts.get', { params: { id: user.id } }).catch(() => {});
    void api.call('content.manifest').catch(() => {});
    expect(true).toBe(true);
  });
});
