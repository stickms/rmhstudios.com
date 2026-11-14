/** Contract for the feed announcements strip (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedPoll } from '@/lib/feed-types';

export interface FeedAnnouncementItem {
  id: string;
  title: string;
  body: string;
  linkUrl:
    | string
    | null;
  linkLabel:
    | string
    | null;
  variant: string;
  createdAt: string;
  imageUrls?: string[];
  gifUrl?:
    | string
    | null;
  poll?: FeedPoll | null;
}

export const listAnnouncementsApi =
  endpoint<{
    res: {
      announcements: FeedAnnouncementItem[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/announcements',
    },
  );
