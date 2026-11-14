/**
 * Contracts for the per-account /api/discovery/** settings (redesign audit C1,
 * batch 7): keyword alerts, the "On this day" opt-in and watch levels; batch 10 adds the
 * custom-feed reads and Surprise me.
 * Client-safe: every type is `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedItem } from '@/lib/feed-types';
import type { FeedSummary } from '@/lib/discovery/feeds.server';
import type { Surprise } from '@/lib/discovery/surprise.server';
import type {
  alertCreateSchema,
  CustomFeedInput,
  TrendingWhy,
  WatchKind,
  WatchLevel,
} from '@/lib/discovery/schema';

export interface DiscoveryAlert {
  id: string;
  query: string;
}

export const listDiscoveryAlertsApi =
  endpoint<{
    res: {
      alerts: DiscoveryAlert[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/discovery/alerts',
    },
  );

/** 201 with the stored alert; the server's `{ error }` on a refused query. */
export const addDiscoveryAlertApi =
  endpoint<{
    body: z.infer<
      typeof alertCreateSchema
    >;
    res: {
      alert: DiscoveryAlert;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/discovery/alerts',
    },
  );

export const removeDiscoveryAlertApi =
  endpoint<{
    query: {
      id: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/discovery/alerts',
    },
  );

export const getDiscoveryMemoriesApi =
  endpoint<{
    res: {
      enabled: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/discovery/memories',
    },
  );

export const setDiscoveryMemoriesApi =
  endpoint<{
    body: {
      enabled: boolean;
    };
    res: {
      enabled: boolean;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/discovery/memories',
    },
  );

export const getDiscoveryWatchApi =
  endpoint<{
    query: {
      kind: WatchKind;
      targetId: string;
    };
    res: {
      level: WatchLevel;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/discovery/watch',
    },
  );

export const setDiscoveryWatchApi =
  endpoint<{
    body: {
      kind: WatchKind;
      targetId: string;
      level: WatchLevel;
    };
    res: {
      level: WatchLevel;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/discovery/watch',
    },
  );

/** Define a custom feed (tags + people + keywords); the 201 carries it. */
export const createCustomFeedApi =
  endpoint<{
    body: CustomFeedInput;
    res: {
      feed: {
        id: string;
      };
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/feeds',
    },
  );

/** Why a tag is trending. 404 when it is not. */
export const whyTrendingApi =
  endpoint<{
    params: {
      tag: string;
    };
    res: TrendingWhy;
  }>()(
    {
      method:
        'GET',
      path: '/api/discovery/trending/$tag',
    },
  );

/** The caller's feeds, the ones they subscribe to and popular public ones. */
export const listFeedsApi =
  endpoint<{
    res: {
      mine: FeedSummary[];
      subscribed: FeedSummary[];
      popular: FeedSummary[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/feeds',
    },
  );

/** One custom feed with a keyset page of its posts. 404 `Not found` when it is missing or private. */
export interface CustomFeedView {
  feed: FeedSummary & {
    people: string[];
    owner: {
      name:
        | string
        | null;
      handle:
        | string
        | null;
      id: string;
    };
  };
  items: FeedItem[];
  nextCursor:
    | string
    | null;
}

export const getCustomFeedApi =
  endpoint<{
    query: {
      cursor?:
        | string
        | undefined;
    };
    res: CustomFeedView;
  }>()(
    {
      method:
        'GET',
      path: '/api/feeds/$id',
    },
  );

/** One random destination, avoiding `not` (the one just shown). 404 when nothing qualifies. */
export const getSurpriseApi =
  endpoint<{
    query: {
      not?:
        | string
        | undefined;
    };
    res: Surprise;
  }>()(
    {
      method:
        'GET',
      path: '/api/discovery/surprise',
    },
  );
