import type { LocalHandler } from '@logicpath/api-client/local';
import type { platform } from '@logicpath/contracts';
import { searchBundle } from '@logicpath/search-rules';
import type { LocalDb } from '../db';
import { liveVersion } from './content';

/** Full-text search over the live curriculum (the search service runs the same rules). */
export function searchHandlers(db: LocalDb): Record<string, LocalHandler> {
  return {
    'search.query': (_ctx, { query }) =>
      searchBundle(liveVersion(db).bundle, query as platform.SearchQuery),
  };
}
