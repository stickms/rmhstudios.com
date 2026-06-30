'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Loader2 } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { FeedItem } from '@/lib/feed-types';

export function TagColumn({ tag }: { tag: string }) {
  const { t } = useTranslation('feed');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
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
    [tag]
  );

  useEffect(() => {
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
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Hash className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{tag}</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState description={t('no-posts-with-tag', { tag, defaultValue: 'No posts with #{{tag}} yet.' })} />
      ) : (
        <div className="divide-y divide-site-border">
          {items.map((item) => (
            <RMHarkCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center py-4">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
    </div>
  );
}
