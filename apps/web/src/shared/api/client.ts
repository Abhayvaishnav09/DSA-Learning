'use client';

import {
  createClient,
  httpTransport,
  localTransport,
  memoryTokenStore,
  type ApiClient,
  type TokenStore,
} from '@logicpath/api-client';
import type { LocalApi } from '@logicpath/local-backend';
import { safeLocalStorage } from '@/shared/lib/storage';

/**
 * Which backend the app talks to (docs/api/README.md):
 * - `local`: the whole API runs in the page (demo link, guest mode, no server needed).
 * - `http`: the API gateway at NEXT_PUBLIC_API_URL.
 */
export const API_MODE: 'local' | 'http' =
  process.env.NEXT_PUBLIC_API_MODE === 'http' ? 'http' : 'local';

const TOKEN_KEY = 'logicpath:local-token';

/** Local mode keeps its demo session across reloads; http keeps the access token in memory only. */
function localTokenStore(): TokenStore {
  return {
    getAccessToken: () => safeLocalStorage.getItem(TOKEN_KEY) as string | null,
    getRefreshToken: () => null,
    save: (tokens) => void safeLocalStorage.setItem(TOKEN_KEY, tokens.accessToken),
    clear: () => void safeLocalStorage.removeItem(TOKEN_KEY),
  };
}

let localBackend: Promise<LocalApi> | null = null;

/** The in-page backend, loaded on first use so http builds don't ship it in the main bundle. */
export function getLocalBackend(): Promise<LocalApi> {
  localBackend ??= Promise.all([
    import('@logicpath/local-backend'),
    import('@/shared/content/bundle'),
  ]).then(async ([{ createLocalBackend }, { bundle }]) => {
    const backend = createLocalBackend({
      seed: bundle,
      storage: {
        getItem: (k) => safeLocalStorage.getItem(k) as string | null,
        setItem: (k, v) => void safeLocalStorage.setItem(k, v),
        removeItem: (k) => void safeLocalStorage.removeItem(k),
      },
    });
    await backend.ready;
    return backend;
  });
  return localBackend;
}

let client: ApiClient | null = null;
let expiredListener: (() => void) | null = null;

export function onSessionExpired(listener: () => void) {
  expiredListener = listener;
}

export function getApiClient(): ApiClient {
  if (client) return client;
  if (API_MODE === 'http') {
    client = createClient(
      httpTransport({
        baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
        tokens: memoryTokenStore(),
        client: 'web',
        onSessionExpired: () => expiredListener?.(),
      }),
    );
  } else {
    const tokens = localTokenStore();
    const transport = getLocalBackend().then((backend) =>
      localTransport({
        backend,
        tokens,
        latencyMs: 120,
        validateResponses: process.env.NODE_ENV !== 'production',
      }),
    );
    // Every call waits for the backend to load and seed (demo accounts, curriculum) once.
    client = createClient({ request: async (...args) => (await transport).request(...args) });
  }
  return client;
}
