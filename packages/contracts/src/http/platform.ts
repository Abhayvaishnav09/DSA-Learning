import { z } from 'zod';
import { Id, IsoDateTime, LocalDate, Role, page } from '../common';

/** Consent and privacy, analytics, audit, search, media, flags and the developer platform. */

// ---------- consent & privacy ----------

export const ConsentRequest = z
  .object({
    childName: z.string(),
    requestedAt: IsoDateTime,
    status: z.enum(['pending', 'granted', 'denied', 'expired']),
  })
  .meta({ id: 'ConsentRequest' });

export const ConsentDecision = z
  .object({ token: z.string().min(10), decision: z.enum(['grant', 'deny']) })
  .meta({ id: 'ConsentDecision' });

export const PendingConsent = z
  .object({
    requestId: Id,
    userId: Id,
    childName: z.string(),
    parentEmail: z.string(),
    requestedAt: IsoDateTime,
    status: z.enum(['pending', 'granted', 'denied', 'expired']),
  })
  .meta({ id: 'PendingConsent' });
export const PendingConsentPage = page(PendingConsent).meta({ id: 'PendingConsentPage' });

export const DataExport = z
  .object({
    userId: Id,
    generatedAt: IsoDateTime,
    services: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'DataExport' });

export const DeletionStatus = z
  .object({
    requestId: Id,
    status: z.enum(['pending', 'completed']),
    services: z.array(z.object({ service: z.string(), completedAt: IsoDateTime.nullable() })),
    requestedAt: IsoDateTime,
  })
  .meta({ id: 'DeletionStatus' });

// ---------- analytics ----------

const DayCount = z.object({ date: LocalDate, value: z.number() });

export const AdminOverview = z
  .object({
    activeUsers: z.object({
      day: z.number().int(),
      week: z.number().int(),
      month: z.number().int(),
    }),
    signups: z.array(DayCount),
    attempts: z.array(DayCount),
    correctRate: z.array(DayCount),
    lessonsCompleted: z.array(DayCount),
    topMisconceptions: z.array(z.object({ id: z.string(), count: z.number().int() })),
    hardestItems: z.array(
      z.object({ itemId: z.string(), attempts: z.number().int(), firstTryRate: z.number() }),
    ),
  })
  .meta({ id: 'AdminOverview' });
export type AdminOverview = z.infer<typeof AdminOverview>;

export const ItemStats = z
  .object({
    items: z.array(
      z.object({
        itemId: z.string(),
        conceptId: z.string(),
        attempts: z.number().int(),
        firstTryRate: z.number(),
        avgHints: z.number(),
        avgSeconds: z.number(),
        topMisconception: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'ItemStats' });

// ---------- audit ----------

export const AuditEntry = z
  .object({
    id: Id,
    actorId: Id.nullable(),
    actorRole: Role.nullable(),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    details: z.record(z.string(), z.unknown()),
    at: IsoDateTime,
  })
  .meta({ id: 'AuditEntry' });
export const AuditPage = page(AuditEntry).meta({ id: 'AuditPage' });
export const AuditQuery = z.object({
  actorId: Id.optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- search ----------

export const SearchType = z.enum(['concept', 'lesson', 'item', 'misconception']);

export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  type: SearchType.optional(),
  locale: z.enum(['en', 'hi-Latn']).default('en'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const SearchHit = z
  .object({
    type: SearchType,
    id: z.string(),
    conceptId: z.string(),
    title: z.string(),
    snippet: z.string(),
    highlights: z
      .array(z.tuple([z.number().int(), z.number().int()]))
      .describe('[start, end) character ranges in the snippet that matched'),
    score: z.number(),
  })
  .meta({ id: 'SearchHit' });
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResults = z
  .object({ hits: z.array(SearchHit), total: z.number().int() })
  .meta({ id: 'SearchResults' });

// ---------- media ----------

export const MEDIA_VARIANTS = ['w320', 'w640', 'w1280'] as const;

export const MediaAsset = z
  .object({
    id: Id,
    filename: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    bytes: z.number().int(),
    alt: z.string(),
    blurDataUrl: z.string().describe('Tiny inline placeholder shown while the image loads'),
    urls: z.record(z.enum(MEDIA_VARIANTS), z.string()),
    uploadedBy: Id,
    createdAt: IsoDateTime,
  })
  .meta({ id: 'MediaAsset' });
export type MediaAsset = z.infer<typeof MediaAsset>;
export const MediaPage = page(MediaAsset).meta({ id: 'MediaPage' });

// ---------- flags ----------

export const PLATFORMS = ['web', 'android'] as const;
export const Platform = z.enum(PLATFORMS);

export const Flag = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/),
    description: z.string(),
    enabled: z.boolean(),
    rolloutPercent: z.number().int().min(0).max(100),
    roles: z.array(Role).describe('Empty means everyone'),
    platforms: z.array(Platform).describe('Empty means every platform'),
    minAppVersion: z.string().nullable(),
    value: z.unknown().describe('Remote config value returned when the flag is on'),
    updatedAt: IsoDateTime,
  })
  .meta({ id: 'Flag' });
export type Flag = z.infer<typeof Flag>;

export const FlagChange = Flag.omit({ key: true, updatedAt: true }).meta({ id: 'FlagChange' });
export const FlagList = z.object({ items: z.array(Flag) }).meta({ id: 'FlagList' });

export const EvaluatedFlags = z
  .object({ flags: z.record(z.string(), z.object({ on: z.boolean(), value: z.unknown() })) })
  .meta({ id: 'EvaluatedFlags' });
export type EvaluatedFlags = z.infer<typeof EvaluatedFlags>;

export const FlagsQuery = z.object({
  platform: Platform.default('web'),
  appVersion: z.string().optional(),
});

// ---------- developer platform ----------

export const API_SCOPES = ['curriculum:read'] as const;
export const ApiScope = z.enum(API_SCOPES);

export const ApiKey = z
  .object({
    id: Id,
    name: z.string(),
    prefix: z.string().describe('First characters of the key, to recognise it (lp_live_ab12…)'),
    scopes: z.array(ApiScope),
    plan: z.enum(['free', 'partner']),
    dailyQuota: z.number().int(),
    usageToday: z.number().int(),
    ownerId: Id,
    createdAt: IsoDateTime,
    lastUsedAt: IsoDateTime.nullable(),
    revokedAt: IsoDateTime.nullable(),
  })
  .meta({ id: 'ApiKey' });
export type ApiKey = z.infer<typeof ApiKey>;

export const CreateApiKey = z
  .object({ name: z.string().trim().min(2).max(60), scopes: z.array(ApiScope).min(1) })
  .meta({ id: 'CreateApiKey' });

export const CreatedApiKey = ApiKey.extend({
  secret: z.string().describe('The full key. Shown once; store it safely'),
}).meta({ id: 'CreatedApiKey' });

export const ApiKeyList = z.object({ items: z.array(ApiKey) }).meta({ id: 'ApiKeyList' });
export const ApiKeyPage = page(ApiKey).meta({ id: 'ApiKeyPage' });

export const ApiKeyUsage = z
  .object({ days: z.array(z.object({ date: LocalDate, requests: z.number().int() })) })
  .meta({ id: 'ApiKeyUsage' });

export const AdminApiKeyUpdate = z
  .object({
    plan: z.enum(['free', 'partner']).optional(),
    dailyQuota: z.number().int().min(0).optional(),
  })
  .meta({ id: 'AdminApiKeyUpdate' });

// Types for every schema above.
export type ConsentRequest = z.infer<typeof ConsentRequest>;
export type ConsentDecision = z.infer<typeof ConsentDecision>;
export type PendingConsent = z.infer<typeof PendingConsent>;
export type PendingConsentPage = z.infer<typeof PendingConsentPage>;
export type DataExport = z.infer<typeof DataExport>;
export type DeletionStatus = z.infer<typeof DeletionStatus>;
export type ItemStats = z.infer<typeof ItemStats>;
export type AuditEntry = z.infer<typeof AuditEntry>;
export type AuditPage = z.infer<typeof AuditPage>;
export type AuditQuery = z.infer<typeof AuditQuery>;
export type SearchType = z.infer<typeof SearchType>;
export type SearchQuery = z.infer<typeof SearchQuery>;
export type SearchResults = z.infer<typeof SearchResults>;
export type MediaPage = z.infer<typeof MediaPage>;
export type Platform = z.infer<typeof Platform>;
export type FlagChange = z.infer<typeof FlagChange>;
export type FlagList = z.infer<typeof FlagList>;
export type FlagsQuery = z.infer<typeof FlagsQuery>;
export type ApiScope = z.infer<typeof ApiScope>;
export type CreateApiKey = z.infer<typeof CreateApiKey>;
export type CreatedApiKey = z.infer<typeof CreatedApiKey>;
export type ApiKeyList = z.infer<typeof ApiKeyList>;
export type ApiKeyPage = z.infer<typeof ApiKeyPage>;
export type ApiKeyUsage = z.infer<typeof ApiKeyUsage>;
export type AdminApiKeyUpdate = z.infer<typeof AdminApiKeyUpdate>;
