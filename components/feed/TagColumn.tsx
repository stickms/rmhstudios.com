'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Loader2 } from 'lucide-react';
import { VirtualPostList } from './VirtualPostList';
import { ColumnHeader } from './ColumnHeader';
import { AsyncReveal } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { FeedItem } from '@/lib/feed-types';

export function TagColumn({
  tag,
  initialData,
}: {
  tag: string;
  /** First page prefetched by the route loader. */
  initialData?: { items: FeedItem[]; nextCursor: string | null; hasMore: boolean } | null;
}) {
  const { t } = useTranslation('feed');
  // Seed from the loader when provided so the feed paints immediately and the
  // mount fetch is skipped. Pagination still fetches.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [items, setItems] = useState<FeedItem[]>(initialData?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(!!initialData?.hasMore);
  const [loading, setLoading] = useState(!seeded.current);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (cur?: string) => {
      try {
        const url = new URL(`/api/tags/${encodeURIComponent(tag)}`, window.location.origin);
        if (cur) url.searchParams.set('cursor', cur);
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        setItems((prev) => (cur ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor ?? null);
        setHasMore(!!data.hasMore);
      } finally {
        setLoading(false);
      }
    },
    [tag],
  );

  useEffect(() => {
    // First mount already has the loader's first page; consume the seed and skip
    // the fetch. Subsequent tag navigations fall through and fetch client-side.
    if (seeded.current) {
      seeded.current = false;
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    await load(cursor);
    setLoadingMore(false);
  };

  return (
    <div className="min-h-screen">
      <ColumnHeader icon={Hash} title={tag} />

      {loading && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}
      <AsyncReveal show={!loading}>
        {items.length === 0 ? (
          <EmptyState
            description={t('no-posts-with-tag', {
              tag,
              defaultValue: 'No posts with #{{tag}} yet.',
            })}
          />
        ) : (
          <VirtualPostList items={items} />
        )}
      </AsyncReveal>

      {hasMore && (
        <div className="flex justify-center py-4">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('load-more', { defaultValue: 'Load more' })
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
