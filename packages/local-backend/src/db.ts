import type { ContentBundle } from '@logicpath/content-schema';
import type { authoring, engagement, identity, platform, profile } from '@logicpath/contracts';
import type { LearnerState } from '@logicpath/progress-rules';

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

export interface AttemptRow {
  id: string;
  userId: string;
  itemId: string;
  conceptId: string;
  correct: boolean;
  misconception: string | null;
  hintLevel: number;
  durationMs: number;
  source: 'lesson' | 'predict' | 'review';
  at: string;
}

export interface XpRow {
  userId: string;
  amount: number;
  reason: string;
  at: string;
}

export interface LeagueRow {
  tier: engagement.LeagueTier;
  /** Monday of the week this tier was reached. */
  since: string;
}

export interface ClassRow {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  createdAt: string;
}

export interface NotificationRow extends engagement.Notification {
  userId: string;
}

export interface ConsentRow {
  id: string;
  userId: string;
  token: string;
  parentEmail: string;
  childName: string;
  status: 'pending' | 'granted' | 'denied' | 'expired';
  requestedAt: string;
}

export interface MediaRow extends platform.MediaAsset {
  /** The picture itself, kept in the browser as a data URL. */
  dataUrl: string;
}

export interface ApiKeyRow extends Omit<platform.ApiKey, 'usageToday'> {
  secretHash: string;
  /** Requests per local day. */
  usage: Record<string, number>;
}

export interface MailRow {
  id: string;
  to: string;
  subject: string;
  body: string;
  /** The in-app link the email would carry. */
  link: string | null;
  at: string;
}

export interface TokenRow {
  kind: 'verify' | 'reset';
  userId: string;
  expiresAt: string;
}

export interface DeletionRow {
  id: string;
  userId: string;
  requestedAt: string;
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
  learners: Record<string, LearnerState>;
  attempts: AttemptRow[];
  xp: XpRow[];
  badges: Record<string, { id: string; earnedAt: string }[]>;
  leagues: Record<string, LeagueRow>;
  leagueHistory: Record<string, engagement.LeagueHistory['items']>;
  settledWeeks: string[];
  classes: ClassRow[];
  members: { classId: string; userId: string; joinedAt: string }[];
  notifications: NotificationRow[];
  notificationPrefs: Record<string, engagement.NotificationPrefs>;
  consents: ConsentRow[];
  deletions: DeletionRow[];
  flags: platform.Flag[];
  media: MediaRow[];
  apiKeys: ApiKeyRow[];
  mailbox: MailRow[];
  tokens: Record<string, TokenRow>;
  /** Small markers, e.g. which demo days have been simulated already. */
  meta: Record<string, string>;
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
  learners: {},
  attempts: [],
  xp: [],
  badges: {},
  leagues: {},
  leagueHistory: {},
  settledWeeks: [],
  classes: [],
  members: [],
  notifications: [],
  notificationPrefs: {},
  consents: [],
  deletions: [],
  flags: [],
  media: [],
  apiKeys: [],
  mailbox: [],
  tokens: {},
  meta: {},
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
