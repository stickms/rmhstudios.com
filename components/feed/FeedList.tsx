'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useFeedStore } from '@/stores/feedStore';
import { FeedItem } from './FeedItem';
import { Loader2 } from 'lucide-react';

export function FeedList() {
  const { items, loading, hasMore, fetchNextPage } = useFeedStore();
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

  return (
    <div>
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
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <p className="text-lg font-medium text-site-text mb-1">Nothing here yet</p>
          <p className="text-sm text-site-text-muted">
            Be the first to post an RMHeet, or check back later!
          </p>
        </div>
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
