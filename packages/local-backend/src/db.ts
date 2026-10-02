import type { ContentBundle } from '@logicpath/content-schema';
import type { authoring, identity, platform, profile } from '@logicpath/contracts';

/** Where the local database is kept: localStorage in browsers, memory in tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

export interface UserRow extends identity.User {
  passwordHash: string;
  salt: string;
  birthYear: number;
  locale: 'en' | 'hi-Latn';
  parentEmail: string | null;
}

export interface SessionRow {
  userId: string;
  expiresAt: string;
}

export interface VersionRow {
  id: string;
  number: number;
  bundle: ContentBundle;
  note: string;
  submissionId: string | null;
  publishedBy: string | null;
  publishedAt: string;
}

export interface DraftRow extends Omit<authoring.Draft, 'activity' | 'changeCount'> {
  createdAt: string;
}

export interface Tables {
  schema: number;
  users: Record<string, UserRow>;
  sessions: Record<string, SessionRow>;
  profiles: Record<string, profile.Profile>;
  versions: VersionRow[];
  currentVersionId: string | null;
  drafts: Record<string, DraftRow>;
  activity: (authoring.Activity & { draftId: string })[];
  audit: platform.AuditEntry[];
}

const SCHEMA = 1;
const empty = (): Tables => ({
  schema: SCHEMA,
  users: {},
  sessions: {},
  profiles: {},
  versions: [],
  currentVersionId: null,
  drafts: {},
  activity: [],
  audit: [],
});

/**
 * A tiny document database for the in-browser backend. Everything lives in one JSON object;
 * writes are batched and saved after the current task, so a burst of changes is one save.
 */
export class LocalDb {
  t: Tables;
  private pending = false;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = 'logicpath:local-db',
  ) {
    this.t = this.load();
  }

  private load(): Tables {
    try {
      const raw = this.storage.getItem(this.key);
      const parsed = raw ? (JSON.parse(raw) as Tables) : null;
      return parsed?.schema === SCHEMA ? { ...empty(), ...parsed } : empty();
    } catch {
      return empty();
    }
  }

  /** Marks the data as changed; it is written once the current work finishes. */
  touch(): void {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => this.flush());
  }

  flush(): void {
    this.pending = false;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.t));
    } catch {
      // Storage full or blocked (private mode): keep working in memory.
    }
  }

  reset(): void {
    this.t = empty();
    this.storage.removeItem(this.key);
  }

  get isEmpty(): boolean {
    return Object.keys(this.t.users).length === 0;
  }
}
