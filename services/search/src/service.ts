import { platform, Problem, type EventEnvelope } from '@logicpath/contracts';
import type { loadConfig } from '@logicpath/service-kit';
import { ContentCache, type ServiceContext, type ServiceDefinition } from '@logicpath/service-kit';
import { searchBundle } from '@logicpath/search-rules';
import { z } from 'zod';

export const env = {
  CONTENT_URL: z.url().default('http://127.0.0.1:4104'),
  /** A bundle file to search instead of asking the content service (local runs and tests). */
  CONTENT_BUNDLE_PATH: z.string().optional(),
};
export type SearchConfig = ReturnType<typeof loadConfig<typeof env>>;

/**
 * Search over the published curriculum. It holds no data of its own: the curriculum comes from
 * the content service and is fetched again whenever a new version is published.
 */
export function searchService(config: SearchConfig): ServiceDefinition<SearchConfig> {
  let content: ContentCache | null = null;
  const cache = (ctx: ServiceContext<SearchConfig>) =>
    (content ??= new ContentCache(config, ctx.log));

  return {
    title: 'LogicPath Search',
    description: 'Search lessons, questions and common mistakes, in English or Hinglish.',
    config,
    consumers: (ctx) => [
      {
        name: 'search',
        types: ['content.version.published'],
        handle: async (_event: EventEnvelope) => cache(ctx).refresh(),
      },
    ],
    routes: (app, ctx) => {
      app.get(
        '/v1/search',
        {
          schema: {
            tags: ['search'],
            summary: 'Search the curriculum',
            querystring: platform.SearchQuery,
            response: { 200: platform.SearchResults, 400: Problem },
          },
        },
        async (req) => searchBundle((await cache(ctx).get()).bundle, req.query),
      );
    },
  };
}
