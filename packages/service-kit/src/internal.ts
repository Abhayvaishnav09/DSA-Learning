import type { BaseConfig } from './config';

/**
 * Service-to-service HTTP call on the private network, authenticated with the internal token.
 * Used sparingly: claim-check fetches (e.g. a content bundle named in an event) and the
 * privacy export fan-out. Everything else goes through events.
 */
export async function internalFetch<T>(
  config: Pick<BaseConfig, 'INTERNAL_TOKEN'>,
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
      'x-internal-token': config.INTERNAL_TOKEN,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${url} failed with ${response.status}`);
  return (await response.json()) as T;
}
