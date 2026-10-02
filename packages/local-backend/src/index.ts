import type { LocalBackend, LocalHandler } from '@logicpath/api-client/local';
import type { ContentBundle } from '@logicpath/content-schema';
import { LocalDb, memoryStorage, type KeyValueStorage } from './db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './accounts';
import { ensureDemoLearners, simulateDemo } from './demo';
import { analyticsHandlers } from './domains/analytics';
import { authoringHandlers } from './domains/authoring';
import { classroomHandlers } from './domains/classroom';
import { consentHandlers } from './domains/consent';
import { contentHandlers, seedContent } from './domains/content';
import { developerHandlers } from './domains/developer';
import { flagsHandlers, seedFlags } from './domains/flags';
import { homeHandlers } from './domains/home';
import { authenticate, createUser, identityHandlers, welcome } from './domains/identity';
import { leaderboardHandlers } from './domains/leaderboard';
import { learningHandlers } from './domains/learning';
import { mediaHandlers } from './domains/media';
import { notificationHandlers } from './domains/notifications';
import { profileHandlers } from './domains/profile';
import { rewardsHandlers } from './domains/rewards';
import { searchHandlers } from './domains/search';
import { iso, uuid } from './util';

export { DEMO_ACCOUNTS, DEMO_CLASS_CODE, DEMO_PASSWORD } from './accounts';
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
    seedFlags(db, now());
    if (db.isEmpty) {
      for (const account of DEMO_ACCOUNTS) {
        const row = await createUser(
          db,
          { ...account, password: DEMO_PASSWORD, birthYear: now().getUTCFullYear() - 25 },
          now(),
        );
        welcome(db, row, now());
      }
    }
    // Company for the demo accounts: other learners, a class, and some history to look at.
    await ensureDemoLearners(db, now(), (name, code) => {
      const owner = Object.values(db.t.users).find((u) => u.role === 'admin');
      const members = Object.values(db.t.users).filter((u) => /^learner\d+@/.test(u.email));
      if (!owner) return;
      const id = uuid();
      db.t.classes.push({ id, name, code, ownerId: owner.id, createdAt: iso(now()) });
      for (const member of members.slice(0, 8)) {
        db.t.members.push({ classId: id, userId: member.id, joinedAt: iso(now()) });
      }
    });
    simulateDemo(db, now());
    db.flush();
  }

  const handlers: Record<string, LocalHandler> = {
    ...identityHandlers(db),
    ...profileHandlers(db),
    ...contentHandlers(db),
    ...authoringHandlers(db),
    ...learningHandlers(db),
    ...rewardsHandlers(db),
    ...leaderboardHandlers(db),
    ...classroomHandlers(db),
    ...notificationHandlers(db),
    ...consentHandlers(db),
    ...analyticsHandlers(db),
    ...searchHandlers(db),
    ...mediaHandlers(db),
    ...flagsHandlers(db),
    ...developerHandlers(db),
    ...homeHandlers(db),
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
