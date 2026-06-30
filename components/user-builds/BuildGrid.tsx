'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { LayoutGroup, motion } from 'framer-motion';
import { BuildCard } from './BuildCard';
import type { Build, BuildSortOption } from '@/lib/user-builds-types';

interface BuildGridProps {
  initialBuilds?: Build[];
  category?: string;
  technology?: string;
  search?: string;
  sort?: BuildSortOption;
  userId?: string;
  curated?: boolean;
}

export function BuildGrid({
  initialBuilds = [],
  category,
  technology,
  search,
  sort = 'recent',
  userId,
  curated,
}: BuildGridProps) {
  const { t } = useTranslation("c-user-builds");
  const [builds, setBuilds] = useState<Build[]>(initialBuilds);
  const [loading, setLoading] = useState(initialBuilds.length === 0);
  const [resorting, setResorting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasFetchedRef = useRef(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchBuilds = useCallback(
    async (cursorParam?: string) => {
      const isLoadMore = !!cursorParam;
      if (isLoadMore) {
        setLoadingMore(true);
      } else if (hasFetchedRef.current) {
        setResorting(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', '20');
        params.set('sort', sort);
        if (cursorParam) params.set('cursor', cursorParam);
        if (category) params.set('category', category);
        if (technology) params.set('technology', technology);
        if (search) params.set('search', search);
        if (userId) params.set('userId', userId);
        if (curated) params.set('curated', 'true');

        const res = await fetch(`/api/user-builds?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch builds');

        const data = await res.json();

        if (isLoadMore) {
          setBuilds((prev) => [...prev, ...data.items]);
        } else {
          setBuilds(data.items);
        }
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (error) {
        console.error('Error fetching builds:', error);
      } finally {
        hasFetchedRef.current = true;
        setLoading(false);
        setResorting(false);
        setLoadingMore(false);
      }
    },
    [category, technology, search, sort, userId, curated]
  );

  // Initial fetch and refetch on filter changes
  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor) {
          fetchBuilds(cursor);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [cursor, hasMore, loadingMore, fetchBuilds]);

  const handleLike = async (id: string) => {
    // Optimistic update
    setBuilds((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              liked: !b.liked,
              likeCount: b.liked ? b.likeCount - 1 : b.likeCount + 1,
            }
          : b
      )
    );

    try {
      await fetch(`/api/user-builds/${id}/like`, { method: 'POST' });
    } catch {
      // Revert on error
      setBuilds((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                liked: !b.liked,
                likeCount: b.liked ? b.likeCount + 1 : b.likeCount - 1,
              }
            : b
        )
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
      </div>
    );
  }

  if (builds.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-site-text-muted">{t("no-builds-found", { defaultValue: "No builds found" })}</p>
        {search && (
          <p className="text-sm text-site-text-dim mt-2">
            {t("try-different-search", { defaultValue: "Try a different search term" })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <LayoutGroup>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${resorting ? 'opacity-50 pointer-events-none' : ''}`}>
            {builds.map((build) => (
              <motion.div
                key={build.id}
                layout
                transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 } }}
              >
                <BuildCard build={build} onLike={handleLike} />
              </motion.div>
            ))}
        </div>
      </LayoutGroup>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="py-8 flex justify-center">
        {loadingMore && <Loader2 className="w-6 h-6 text-site-accent animate-spin" />}
        {!hasMore && builds.length > 0 && (
          <div className="h-px" />
        )}
      </div>
    </div>
  );
}
