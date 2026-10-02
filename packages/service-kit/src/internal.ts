import type { BaseConfig } from './config';

/** A call to another service answered with an error status (`status` 0: it could not be reached). */
export class InternalCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'InternalCallError';
  }
}

/**
 * Service-to-service HTTP call on the private network, authenticated with the internal token.
 * Used sparingly: claim-check fetches (e.g. a content bundle named in an event), the privacy
 * export fan-out, and the few answers that cannot wait for an event (practice → progress).
 * Everything else goes through events.
 */
export async function internalFetch<T>(
  config: Pick<BaseConfig, 'INTERNAL_TOKEN'>,
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init.headers,
        'x-internal-token': config.INTERNAL_TOKEN,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new InternalCallError(`${init.method ?? 'GET'} ${url} failed: ${String(error)}`, 0);
  }
  if (!response.ok) {
    throw new InternalCallError(
      `${init.method ?? 'GET'} ${url} failed with ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}
