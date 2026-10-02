import { readFileSync } from 'node:fs';
import type { ContentBundle } from '@logicpath/content-schema';
import type { Logger } from 'pino';
import { retry } from './retry';

/** The curriculum a service is working from, and which published version it is. */
export interface LiveContent {
  bundle: ContentBundle;
  /** Increases by one on every publish or rollback (1, 2, 3 …). */
  number: number;
  checksum: string;
}

export interface ContentSource {
  /** The content service, e.g. http://content:8080. */
  CONTENT_URL: string;
  /** A bundle file to use instead of the content service (local runs and tests). */
  CONTENT_BUNDLE_PATH?: string | undefined;
}

/**
 * The published curriculum, kept in memory by services that need to look questions up: grading
 * an answer, placing a concept in the graph, searching. It is fetched when first needed (the
 * content service may still be starting, so that retries) and fetched again when a
 * `content.version.published` event arrives. A failed refresh keeps the copy already held.
 */
export class ContentCache {
  private current: LiveContent | null = null;
  private loading: Promise<LiveContent> | null = null;

  constructor(
    private readonly source: ContentSource,
    private readonly log: Logger,
  ) {}

  get(): Promise<LiveContent> {
    if (this.current) return Promise.resolve(this.current);
    this.loading ??= retry('content', () => this.fetch(), {
      onRetry: (error, attempt, waitMs) =>
        this.log.warn({ err: error, attempt, waitMs }, 'content not ready yet, retrying'),
    })
      .then((live) => (this.current = live))
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  /** Brings the cache up to date; throws when the content service cannot be reached. */
  async refresh(): Promise<void> {
    this.current = await this.fetch();
  }

  private async fetch(): Promise<LiveContent> {
    const { CONTENT_BUNDLE_PATH: path, CONTENT_URL: base } = this.source;
    if (path) {
      const bundle = JSON.parse(readFileSync(path, 'utf8')) as ContentBundle;
      return { bundle, number: 1, checksum: bundle.version };
    }
    const manifest = await getJson<{ number: number; checksum: string }>(
      `${base}/v1/content/manifest`,
    );
    if (this.current?.checksum === manifest.checksum) {
      return { ...this.current, number: manifest.number };
    }
    const bundle = await getJson<ContentBundle>(`${base}/v1/content/bundle`);
    return { bundle, number: manifest.number, checksum: bundle.version };
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return (await response.json()) as T;
}
