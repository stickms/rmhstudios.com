/**
 * Contract for GET /api/analytics/audience. Client-safe: the query type comes from the zod
 * schema by `import type`; the response is plain counts. It never carries the id or name of
 * anyone who unfollowed: losses are numbers only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { audienceQuery } from '@/lib/social/audience-schema';

export interface AudienceDay {
  date: string;
  /** Followers at the end of the day. */
  followers: number;
  gained: number;
  lost: number;
  net: number;
  /** Before the log began only gains are known. */
  gainsOnly: boolean;
}

export interface AudienceNewFollower {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  /** ISO time of the follow. */
  followedAt: string;
  followsBack: boolean;
}

export interface AudienceInsights {
  range: 30 | 90 | 365;
  /** Today in the viewer's time zone, `YYYY-MM-DD`. */
  today: string;
  /** The day the follow log began, or null when no change has been logged yet. */
  logStart: string | null;
  followerCount: number;
  /** One entry per day of the range, oldest first. */
  days: AudienceDay[];
  totals: {
    gained: number;
    lost: number;
    net: number;
  };
  /** Net change per week, oldest first. */
  weeks: {
    start: string;
    net: number;
  }[];
  /** Up to 20 followers gained in the range, newest first. */
  newFollowers: AudienceNewFollower[];
  /** Engagement on the member's posts in the last 90 days: 7 rows (Sunday first) of 24 hours. */
  engagement: number[][];
  mutuals: {
    followers: number;
    mutual: number;
  };
}

export const getAudienceApi = endpoint<{
  query: z.infer<typeof audienceQuery>;
  res: AudienceInsights;
}>()({
  method: 'GET',
  path: '/api/analytics/audience',
});
