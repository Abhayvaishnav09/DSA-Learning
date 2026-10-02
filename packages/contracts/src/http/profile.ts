import { z } from 'zod';
import { Id, IsoDateTime, Locale } from '../common';

export const Theme = z.enum(['system', 'light', 'dark']);

export const Profile = z
  .object({
    userId: Id,
    displayName: z.string(),
    locale: Locale,
    timeZone: z.string().describe('IANA time zone, used for streaks and "today"'),
    dailyGoalMinutes: z.number().int(),
    theme: Theme,
    updatedAt: IsoDateTime,
  })
  .meta({ id: 'Profile' });
export type Profile = z.infer<typeof Profile>;

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const ProfileUpdate = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    locale: Locale.optional(),
    timeZone: z.string().refine(isTimeZone, 'not a valid IANA time zone').optional(),
    dailyGoalMinutes: z
      .union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)])
      .optional(),
    theme: Theme.optional(),
  })
  .meta({ id: 'ProfileUpdate' });
