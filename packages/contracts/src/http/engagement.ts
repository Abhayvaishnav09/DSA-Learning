import { z } from 'zod';
import { Id, IsoDateTime, LocalDate, page } from '../common';

/** Rewards, leagues, classes and notifications: what keeps learners coming back. */

// ---------- gamification ----------

export const Badge = z
  .object({
    id: z.string(),
    title: z.object({ en: z.string(), 'hi-Latn': z.string() }),
    description: z.object({ en: z.string(), 'hi-Latn': z.string() }),
    icon: z.string().describe('Icon name (lucide) used by both apps'),
    tier: z.enum(['bronze', 'silver', 'gold']),
  })
  .meta({ id: 'Badge' });
export type Badge = z.infer<typeof Badge>;

export const XpEntry = z
  .object({ amount: z.number().int(), reason: z.string(), at: IsoDateTime })
  .meta({ id: 'XpEntry' });

export const Rewards = z
  .object({
    xp: z.number().int(),
    level: z.number().int(),
    levelFloorXp: z.number().int(),
    nextLevelXp: z.number().int(),
    xpThisWeek: z.number().int(),
    badges: z.array(z.object({ id: z.string(), earnedAt: IsoDateTime })),
    recent: z.array(XpEntry),
  })
  .meta({ id: 'Rewards' });
export type Rewards = z.infer<typeof Rewards>;

// ---------- leaderboard ----------

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export const LeagueTier = z.enum(LEAGUE_TIERS);
export type LeagueTier = z.infer<typeof LeagueTier>;

export const Standing = z
  .object({
    rank: z.number().int(),
    userId: Id,
    displayName: z.string(),
    xp: z.number().int(),
    isMe: z.boolean(),
    zone: z.enum(['promote', 'stay', 'demote']),
  })
  .meta({ id: 'Standing' });

export const League = z
  .object({
    tier: LeagueTier,
    weekStart: LocalDate,
    endsAt: IsoDateTime,
    standings: z.array(Standing),
  })
  .meta({ id: 'League' });
export type League = z.infer<typeof League>;

export const LeagueHistory = z
  .object({
    items: z.array(
      z.object({
        weekStart: LocalDate,
        tier: LeagueTier,
        rank: z.number().int(),
        xp: z.number().int(),
        result: z.enum(['promoted', 'stayed', 'demoted']),
      }),
    ),
  })
  .meta({ id: 'LeagueHistory' });

// ---------- classroom ----------

export const ClassSummary = z
  .object({
    id: Id,
    name: z.string(),
    code: z.string().nullable().describe('Join code; only shown to the owner and admins'),
    ownerId: Id,
    ownerName: z.string(),
    memberCount: z.number().int(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'ClassSummary' });
export type ClassSummary = z.infer<typeof ClassSummary>;

export const ClassMember = z
  .object({
    userId: Id,
    name: z.string(),
    joinedAt: IsoDateTime,
    conceptsMastered: z.number().int(),
    xpThisWeek: z.number().int(),
    lastActiveOn: LocalDate.nullable(),
  })
  .meta({ id: 'ClassMember' });

export const ClassDetail = ClassSummary.extend({
  members: z.array(ClassMember).describe('Full roster for the owner and admins; empty for members'),
}).meta({ id: 'ClassDetail' });
export type ClassDetail = z.infer<typeof ClassDetail>;

export const ClassList = z.object({ items: z.array(ClassSummary) }).meta({ id: 'ClassList' });
export const ClassPage = page(ClassSummary).meta({ id: 'ClassPage' });

export const CreateClass = z
  .object({
    name: z.string().trim().min(2).max(80),
    ownerId: Id.optional().describe('Defaults to the admin creating it'),
  })
  .meta({ id: 'CreateClass' });

export const JoinClass = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6}$/, '6 letters or digits'),
  })
  .meta({ id: 'JoinClass' });

// ---------- notification ----------

export const Notification = z
  .object({
    id: Id,
    kind: z.enum(['review_due', 'badge', 'level_up', 'league', 'class', 'submission', 'system']),
    title: z.string(),
    body: z.string(),
    link: z.string().nullable().describe('In-app path, e.g. /review'),
    readAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'Notification' });
export type Notification = z.infer<typeof Notification>;

export const NotificationPage = page(Notification)
  .extend({ unreadCount: z.number().int() })
  .meta({ id: 'NotificationPage' });

export const NotificationPrefs = z
  .object({
    reviewReminders: z.boolean(),
    weeklySummary: z.boolean(),
    productNews: z.boolean(),
  })
  .meta({ id: 'NotificationPrefs' });
