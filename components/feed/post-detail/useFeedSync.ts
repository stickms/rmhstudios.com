import { useCallback } from 'react';
import type { FeedItem } from '@/lib/feed-types';
import { useFeedStore } from '@/stores/feedStore';

export interface FeedSync {
  syncToFeed: (updates: Partial<FeedItem>) => void;
  bumpFeedComment: (delta: number) => void;
}

/**
 * Keep the shared feed store in sync with engagement that happens on the post
 * page, so navigating back to the feed reflects the new counts instead of stale
 * ones.
 */
export function useFeedSync(postId: string): FeedSync {
  const syncToFeed = useCallback(
    (updates: Partial<FeedItem>) => {
      const store = useFeedStore.getState();
      if (store.items.some((i) => i.id === postId)) {
        store.updateItem(postId, updates);
      }
    },
    [postId],
  );

  const bumpFeedComment = useCallback(
    (delta: number) => {
      const store = useFeedStore.getState();
      const current = store.items.find((i) => i.id === postId);
      if (current) {
        store.updateItem(postId, {
          commentCount: Math.max(0, (current.commentCount ?? 0) + delta),
        });
      }
    },
    [postId],
  );

  return { syncToFeed, bumpFeedComment };
}
