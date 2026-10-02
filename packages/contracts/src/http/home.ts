import { z } from 'zod';
import { Profile } from './profile';
import { League, Rewards } from './engagement';
import { ProgressMap, ReviewSummary } from './learning';
import { EvaluatedFlags } from './platform';

/** One call for the dashboard, composed by the gateway from several services (BFF style). */
export const Home = z
  .object({
    profile: Profile,
    progress: ProgressMap,
    reviews: ReviewSummary,
    rewards: Rewards,
    league: League.nullable(),
    unreadNotifications: z.number().int(),
    flags: EvaluatedFlags,
    partial: z
      .array(z.string())
      .describe('Services that did not answer in time; their parts hold safe defaults'),
  })
  .meta({ id: 'Home' });
export type Home = z.infer<typeof Home>;
