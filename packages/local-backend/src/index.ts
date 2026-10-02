import type { LocalBackend, LocalHandler } from '@logicpath/api-client/local';
import type { ContentBundle } from '@logicpath/content-schema';
import { LocalDb, memoryStorage, type KeyValueStorage } from './db';
import { authoringHandlers } from './domains/authoring';
import { contentHandlers, seedContent } from './domains/content';
import { authenticate, createUser, identityHandlers } from './domains/identity';
import { profileHandlers } from './domains/profile';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './accounts';

export { DEMO_ACCOUNTS, DEMO_PASSWORD } from './accounts';
export { LocalDb, memoryStorage, type KeyValueStorage } from './db';

export interface LocalBackendOptions {
  /** The curriculum to start with (content/dist/bundle.json). */
  seed: ContentBundle;
  storage?: KeyValueStorage;
  now?: () => Date;
}

export interface LocalApi extends LocalBackend {
  db: LocalDb;
  /** Creates the demo accounts and imports the curriculum on first run. */
  ready: Promise<void>;
  /** Wipes everything and starts again (Settings → "Reset demo data"). */
  reset(): Promise<void>;
}

/**
 * The whole backend, in the page: the same endpoints and rules as the services, kept in
 * localStorage. Powers guest mode and the shareable demo link.
 */
export function createLocalBackend(options: LocalBackendOptions): LocalApi {
  const db = new LocalDb(options.storage ?? memoryStorage());
  const now = options.now ?? (() => new Date());

  async function seed() {
    seedContent(db, options.seed, now());
    if (!db.isEmpty) return;
    for (const account of DEMO_ACCOUNTS) {
      await createUser(
        db,
        { ...account, password: DEMO_PASSWORD, birthYear: now().getUTCFullYear() - 25 },
        now(),
      );
    }
    db.flush();
  }

  const handlers: Record<string, LocalHandler> = {
    ...identityHandlers(db),
    ...profileHandlers(db),
    ...contentHandlers(db),
    ...authoringHandlers(db),
  };

  // Every write is saved once the handler's work is done.
  const saving = Object.fromEntries(
    Object.entries(handlers).map(([id, handle]) => [
      id,
      async (...args: Parameters<LocalHandler>) => {
        const result: unknown = await handle(...args);
        db.touch();
        return result;
      },
    ]),
  );

  const api: LocalApi = {
    db,
    handlers: saving,
    authenticate: (token) => authenticate(db, token, now()),
    ready: seed(),
    reset: async () => {
      db.reset();
      await seed();
    },
  };
  return api;
}
