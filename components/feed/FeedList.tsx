'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useFeedStore } from '@/stores/feedStore';
import { FeedItem } from './FeedItem';
import { Loader2, ArrowUp } from 'lucide-react';

interface FeedListProps {
  /** Whether this is the Following surface — drives empty-state copy. */
  following?: boolean;
  /** Cold-start CTA: switch the viewer to the For You surface. */
  onSwitchToForYou?: () => void;
}

export function FeedList({ following = false, onSwitchToForYou }: FeedListProps) {
  const { items, loading, hasMore, fetchNextPage, pendingItems, flushPending } =
    useFeedStore();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);

  // Initial fetch
  useEffect(() => {
    if (!initialFetched.current) {
      initialFetched.current = true;
      fetchNextPage();
    }
  }, [fetchNextPage]);

  // Infinite scroll via IntersectionObserver
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        fetchNextPage();
      }
    },
    [hasMore, loading, fetchNextPage]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(observerCallback, {
      rootMargin: '200px',
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback]);

  const handleShowNew = () => {
    flushPending();
    // Snap to the top so the freshly inserted posts are visible.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* "N new posts" pill — never auto-yanks the scroll (Twitter pattern) */}
      {pendingItems.length > 0 && (
        <div className="sticky top-24 z-20 flex justify-center pointer-events-none">
          <button
            onClick={handleShowNew}
            className="pointer-events-auto flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-site-accent text-site-bg text-sm font-bold shadow-lg hover:bg-site-accent-hover transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
            {pendingItems.length} new {pendingItems.length === 1 ? 'post' : 'posts'}
          </button>
        </div>
      )}

      {items.map((item) => (
        <FeedItem key={item.id} item={item} />
      ))}

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        following ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">Your Following feed is quiet</p>
            <p className="text-sm text-site-text-muted mb-6">
              Follow some people and their posts will show up here.
            </p>
            {onSwitchToForYou && (
              <button
                onClick={onSwitchToForYou}
                className="px-5 py-2 rounded-lg bg-site-accent text-site-bg text-sm font-bold hover:bg-site-accent-hover transition-colors"
              >
                Browse For You
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">Nothing here yet</p>
            <p className="text-sm text-site-text-muted">
              Be the first to post an RMHark, or check back later!
            </p>
          </div>
        )
      )}

      {/* No more items */}
      {!hasMore && items.length > 0 && (
        <div className="py-8 text-center text-sm text-site-text-dim">
          You&apos;ve reached the end
        </div>
      )}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
