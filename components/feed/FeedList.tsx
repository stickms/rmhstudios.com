'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { FeedItem } from './FeedItem';
import { ArrowUp } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { PostListSkeleton } from '@/components/ui/skeletons/PostCardSkeleton';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

interface FeedListProps {
  /** Whether this is the Following surface — drives empty-state copy. */
  following?: boolean;
  /** Cold-start CTA: switch the viewer to the For You surface. */
  onSwitchToForYou?: () => void;
}

export function FeedList({ following = false, onSwitchToForYou }: FeedListProps) {
  const { t } = useTranslation('feed');
  const { items, loading, initialized, hasMore, fetchNextPage, pendingItems, flushPending } =
    useFeedStore();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);
  // Ids of posts just flushed from the "N new" pill, so they can ease in rather
  // than pop. Cleared after the animation window.
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());

  // Initial fetch. The feed store is module-level, so items survive navigation —
  // returning to the feed (back-nav) shows the cached timeline instantly and,
  // paired with the router's scroll restoration, lands you where you were.
  // Only fetch when there's nothing cached, so a remount never appends a
  // redundant extra page on top of what's already loaded.
  useEffect(() => {
    if (!initialFetched.current) {
      initialFetched.current = true;
      if (items.length === 0) fetchNextPage();
    }
  }, [fetchNextPage, items.length]);

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
    // Tag the incoming posts so they ease in instead of popping. (A container
    // View Transition would clash with the per-image `view-transition-name`s on
    // feed cards, desyncing image vs. text — a scoped per-item enter is the
    // non-jarring option here.)
    if (!prefersReducedMotion()) {
      const flushedIds = new Set(pendingItems.map((i) => i.id));
      setEnteringIds(flushedIds);
      window.setTimeout(() => setEnteringIds(new Set()), 500);
    }
    flushPending();
    // Snap to the top so the freshly inserted posts are visible.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* "N new posts" pill — never auto-yanks the scroll (Twitter pattern) */}
      {pendingItems.length > 0 && (
        <div className="sticky top-24 z-20 mt-4 flex justify-center pointer-events-none">
          <button
            onClick={handleShowNew}
            className="pointer-events-auto flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-site-accent text-site-bg text-sm font-bold shadow-lg hover:bg-site-accent-hover transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
            {t('new-posts', { count: pendingItems.length, defaultValue: '{{count}} new post', defaultValue_plural: '{{count}} new posts' })}
          </button>
        </div>
      )}

      {items.map((item) => {
        const entering = enteringIds.has(item.id);
        // `feed-card-cv` skips layout/paint for cards far from the viewport so
        // long timelines stay smooth. Pending (optimistic) and just-entered
        // posts opt out — they sit at the top and must render (and animate)
        // without being skipped.
        const cv = item.pending || entering ? '' : 'feed-card-cv';
        return (
          <div key={item.id} className={`${cv} ${entering ? 'feed-item-enter' : ''}`.trim() || undefined}>
            <FeedItem item={item} />
          </div>
        );
      })}

      {/* Initial load → layout-matched skeletons so the feed reads as
          "content arriving" rather than a bare spinner, and the empty state
          never flashes before the first page resolves. */}
      {!initialized && items.length === 0 && <PostListSkeleton count={6} />}

      {/* Pagination load (subsequent pages) keeps the compact spinner. */}
      {initialized && loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      {/* Empty state — only after the first fetch has actually completed */}
      {initialized && !loading && items.length === 0 && (
        following ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">{t('following-empty-title', { defaultValue: 'Your Following feed is quiet' })}</p>
            <p className="text-sm text-site-text-muted mb-6">
              {t('following-empty-subtitle', { defaultValue: 'Follow some people and their posts will show up here.' })}
            </p>
            {onSwitchToForYou && (
              <button
                onClick={onSwitchToForYou}
                className="px-5 py-2 rounded-site-sm bg-site-accent text-site-bg text-sm font-bold hover:bg-site-accent-hover transition-colors"
              >
                {t('browse-for-you', { defaultValue: 'Browse For You' })}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">{t('for-you-empty-title', { defaultValue: 'Nothing here yet' })}</p>
            <p className="text-sm text-site-text-muted">
              {t('for-you-empty-subtitle', { defaultValue: 'Be the first to post an RMHark, or check back later!' })}
            </p>
          </div>
        )
      )}

      {/* No more items */}
      {!hasMore && items.length > 0 && (
        <div className="py-8 text-center text-sm text-site-text-dim">
          {t('reached-end', { defaultValue: "You've reached the end" })}
        </div>
      )}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
