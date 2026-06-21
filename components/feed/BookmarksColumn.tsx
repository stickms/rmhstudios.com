'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bookmark, Loader2 } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { Button } from '@/components/ui/button';
import type { FeedItem } from '@/lib/feed-types';

export function BookmarksColumn() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (cur?: string) => {
    try {
      const url = new URL('/api/bookmarks', window.location.origin);
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
  }, []);

  useEffect(() => {
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
        <Bookmark className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">Bookmarks</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <div className="rounded-2xl border border-site-border bg-site-surface p-4">
            <Bookmark className="h-8 w-8 text-site-text-muted" />
          </div>
          <p className="font-medium text-site-text">No bookmarks yet</p>
          <p className="max-w-xs text-sm text-site-text-muted">
            Save posts from the &ldquo;&hellip;&rdquo; menu and they&apos;ll show up here.
          </p>
        </div>
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
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
