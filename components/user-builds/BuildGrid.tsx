'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BuildCard } from './BuildCard';
import type { Build, BuildSortOption } from '@/lib/user-builds-types';

interface BuildGridProps {
  initialBuilds?: Build[];
  category?: string;
  technology?: string;
  search?: string;
  sort?: BuildSortOption;
  userId?: string;
}

export function BuildGrid({
  initialBuilds = [],
  category,
  technology,
  search,
  sort = 'recent',
  userId,
}: BuildGridProps) {
  const [builds, setBuilds] = useState<Build[]>(initialBuilds);
  const [loading, setLoading] = useState(initialBuilds.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchBuilds = useCallback(
    async (cursorParam?: string) => {
      const isLoadMore = !!cursorParam;
      if (isLoadMore) {
        setLoadingMore(true);
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
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, technology, search, sort, userId]
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
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (builds.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-site-text-muted">No builds found</p>
        {search && (
          <p className="text-sm text-site-text-dim mt-2">
            Try a different search term
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {builds.map((build) => (
          <BuildCard key={build.id} build={build} onLike={handleLike} />
        ))}
      </div>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="py-8 flex justify-center">
        {loadingMore && <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />}
        {!hasMore && builds.length > 0 && (
          <p className="text-sm text-site-text-dim">No more builds</p>
        )}
      </div>
    </div>
  );
}
