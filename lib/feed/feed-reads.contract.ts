/**
 * Contracts for the feed's small reads (redesign audit C1, batches 8 and 10): `@mention`
 * autocomplete, the main timeline page, a profile's posts and likes pages, the handle
 * availability check and the deck marketplace. Client-safe: types only, by `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  FeedFilter,
  FeedItem,
} from '@/lib/feed-types';
import type { TimelineResult } from '@/lib/feed/timeline';
import type { searchMentionUsers } from '@/lib/feed/mention-search.server';
import type { MarketplaceList } from '@/lib/study.server';

/** Viewer-aware `@mention` suggestions; an empty `q` suggests friends. */
export const mentionSearchApi =
  endpoint<{
    query: {
      q: string;
    };
    res: {
      users: Awaited<
        ReturnType<
          typeof searchMentionUsers
        >
      >;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/feed/mention-search',
    },
  );

/** One keyset page of a profile's posts or likes. */
export interface ProfilePostsPageRes {
  items: FeedItem[];
  nextCursor:
    | string
    | null;
  hasMore: boolean;
}

export const profilePostsApi =
  endpoint<{
    query: {
      limit: number;
      cursor?:
        | string
        | undefined;
    };
    res: ProfilePostsPageRes;
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/$id/rmharks',
    },
  );

export const profileLikesApi =
  endpoint<{
    query: {
      limit: number;
      cursor?:
        | string
        | undefined;
    };
    res: ProfilePostsPageRes;
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/$id/likes',
    },
  );

/** Browse public flashcard decks; `q` filters by title or description. */
export const deckMarketplaceApi =
  endpoint<{
    query: {
      q: string;
    };
    res: MarketplaceList;
  }>()(
    {
      method:
        'GET',
      path: '/api/study/marketplace',
    },
  );

/** Is a profile handle free? `reason` is set (with `available: false`) for a malformed handle. */
export const checkHandleApi =
  endpoint<{
    query: {
      handle: string;
    };
    res: {
      available: boolean;
      reason?: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/handle/check',
    },
  );

/**
 * One keyset page of the main feed. `feed=following` is the Following surface (the legacy
 * `filter=friends` means the same); `search` needs a session (401) and is rate limited (429).
 */
export const getTimelineApi =
  endpoint<{
    query: {
      limit?:
        | number
        | undefined;
      cursor?:
        | string
        | undefined;
      filter?:
        | FeedFilter
        | undefined;
      feed?:
        | 'following'
        | 'foryou'
        | undefined;
      search?:
        | string
        | undefined;
    };
    res: TimelineResult;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmharks',
    },
  );
