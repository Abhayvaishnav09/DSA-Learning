import { z } from 'zod';
import { Id, IsoDateTime, LocalDate, Locale, Role } from './common';

/**
 * Event catalog (docs/api/asyncapi.yaml is generated from this file).
 * Events travel on NATS JetStream as `<prefix>.<type>`; every event uses the same envelope.
 * Breaking changes need a new type version; consumers must ignore unknown fields.
 */

const UserStatus = z.enum(['active', 'pending_consent', 'suspended']);

const ContentIssue = z.object({ file: z.string(), message: z.string() });

/** One payment of XP and why: the learner's progress decides it, gamification records it. */
export const XpPart = z.object({
  amount: z.number().int().min(1),
  reason: z.enum(['attempt', 'daily-goal', 'streak', 'lesson']),
});

export const EVENTS = {
  // identity
  'identity.user.registered': z.object({
    userId: Id,
    email: z.string(),
    name: z.string(),
    role: Role,
    locale: Locale,
    birthYear: z.number().int(),
    minor: z.boolean(),
    parentEmail: z.string().nullable(),
    status: UserStatus,
  }),
  'identity.user.email_verification_requested': z.object({
    userId: Id,
    email: z.string(),
    name: z.string(),
    locale: Locale,
    token: z.string(),
  }),
  'identity.user.password_reset_requested': z.object({
    userId: Id,
    email: z.string(),
    name: z.string(),
    locale: Locale,
    token: z.string(),
  }),
  'identity.user.role_changed': z.object({ userId: Id, role: Role, previousRole: Role }),
  'identity.user.status_changed': z.object({
    userId: Id,
    status: UserStatus,
    previousStatus: UserStatus,
  }),

  // profile
  'profile.updated': z.object({
    userId: Id,
    displayName: z.string(),
    locale: Locale,
    timeZone: z.string(),
    dailyGoalMinutes: z.number().int(),
  }),

  // consent & privacy
  'consent.requested': z.object({
    requestId: Id,
    userId: Id,
    parentEmail: z.string(),
    childName: z.string(),
    locale: Locale,
    token: z.string(),
  }),
  'consent.granted': z.object({ requestId: Id, userId: Id }),
  'consent.denied': z.object({ requestId: Id, userId: Id }),
  'privacy.deletion.requested': z.object({ requestId: Id, userId: Id }),
  'privacy.deletion.completed': z.object({ requestId: Id, userId: Id, service: z.string() }),

  // authoring & content
  'authoring.submission.submitted': z.object({ submissionId: Id, authorId: Id, title: z.string() }),
  'authoring.submission.approved': z.object({
    submissionId: Id,
    authorId: Id,
    reviewerId: Id,
    title: z.string(),
  }),
  'authoring.submission.rejected': z.object({
    submissionId: Id,
    authorId: Id,
    reviewerId: Id,
    title: z.string(),
    comment: z.string(),
  }),
  'content.version.published': z.object({
    versionId: Id,
    number: z.number().int(),
    checksum: z.string(),
    submissionId: Id.nullable(),
    publishedBy: Id.nullable(),
  }),
  'content.publish.failed': z.object({ submissionId: Id, issues: z.array(ContentIssue) }),

  // learning
  'practice.attempt.recorded': z.object({
    attemptId: Id,
    userId: Id,
    itemId: z.string(),
    conceptId: z.string(),
    contentVersion: z.number().int(),
    correct: z.boolean(),
    hintLevel: z.number().int().min(0).max(3),
    guessProbability: z.number(),
    explainedCorrectly: z.boolean().nullable(),
    misconception: z.string().nullable(),
    durationMs: z.number().int(),
    source: z.enum(['lesson', 'predict', 'review']),
    solutionShown: z.boolean(),
    xp: z.array(XpPart),
    at: IsoDateTime,
  }),
  'practice.item.completed': z.object({
    userId: Id,
    itemId: z.string(),
    cardId: z.string(),
    conceptId: z.string(),
    firstTryCorrect: z.boolean(),
    hintLevel: z.number().int(),
    durationMs: z.number().int(),
    expectedMs: z.number().int(),
    solutionShown: z.boolean(),
    at: IsoDateTime,
  }),
  'progress.lesson.completed': z.object({
    userId: Id,
    conceptId: z.string(),
    xp: z.array(XpPart),
    at: IsoDateTime,
  }),
  'progress.concept.mastered': z.object({ userId: Id, conceptId: z.string(), at: IsoDateTime }),
  'progress.streak.updated': z.object({
    userId: Id,
    current: z.number().int(),
    longest: z.number().int(),
    localDate: LocalDate,
  }),
  'review.card.scheduled': z.object({ userId: Id, cardId: z.string(), due: IsoDateTime }),
  'gamification.badge.earned': z.object({ userId: Id, badgeId: z.string(), at: IsoDateTime }),
  'gamification.level.up': z.object({ userId: Id, level: z.number().int(), xp: z.number().int() }),
  'gamification.xp.awarded': z.object({
    userId: Id,
    amount: z.number().int(),
    reason: z.string(),
    weekStart: LocalDate,
    at: IsoDateTime,
  }),

  // community
  'leaderboard.week.closed': z.object({
    userId: Id,
    weekStart: LocalDate,
    tier: z.string(),
    rank: z.number().int(),
    result: z.enum(['promoted', 'stayed', 'demoted']),
  }),
  'classroom.member.joined': z.object({
    classId: Id,
    userId: Id,
    ownerId: Id,
    className: z.string(),
  }),

  // platform
  'media.asset.created': z.object({ assetId: Id, uploadedBy: Id }),
  'media.asset.deleted': z.object({ assetId: Id }),
  'flags.changed': z.object({ key: z.string(), enabled: z.boolean() }),
  'developer.key.created': z.object({ keyId: Id, ownerId: Id, prefix: z.string() }),
  'developer.key.revoked': z.object({ keyId: Id, ownerId: Id, prefix: z.string() }),

  // audit trail of privileged actions, published by any service
  'audit.recorded': z.object({
    actorId: Id.nullable(),
    actorRole: Role.nullable(),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    details: z.record(z.string(), z.unknown()),
    at: IsoDateTime,
  }),
} as const;

export type EventType = keyof typeof EVENTS;
export type EventData<T extends EventType> = z.infer<(typeof EVENTS)[T]>;

export interface EventEnvelope<T extends EventType = EventType> {
  id: string;
  type: T;
  version: 1;
  occurredAt: string;
  source: string;
  data: EventData<T>;
}

export const EventEnvelopeSchema = z.object({
  id: Id,
  type: z.string(),
  version: z.literal(1),
  occurredAt: IsoDateTime,
  source: z.string(),
  data: z.unknown(),
});

/** Event domains map one-to-one to JetStream streams. */
export const DOMAINS = [
  'identity',
  'profile',
  'consent',
  'privacy',
  'authoring',
  'content',
  'practice',
  'progress',
  'review',
  'gamification',
  'leaderboard',
  'classroom',
  'media',
  'flags',
  'developer',
  'audit',
] as const;
export type Domain = (typeof DOMAINS)[number];

export const domainOf = (type: EventType): Domain => type.split('.')[0] as Domain;

export function makeEvent<T extends EventType>(
  type: T,
  data: EventData<T>,
  source: string,
): EventEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    source,
    data: EVENTS[type].parse(data) as EventData<T>,
  };
}

/** Validates an incoming envelope and its payload against the catalog. */
export function parseEvent(raw: unknown): EventEnvelope {
  const envelope = EventEnvelopeSchema.parse(raw);
  const schema = EVENTS[envelope.type as EventType];
  if (!schema) throw new Error(`unknown event type ${envelope.type}`);
  return {
    ...envelope,
    type: envelope.type as EventType,
    data: schema.parse(envelope.data),
  };
}
