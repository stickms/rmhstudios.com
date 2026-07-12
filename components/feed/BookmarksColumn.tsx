'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Loader2 } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { Reveal } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { FeedItem } from '@/lib/feed-types';

export function BookmarksColumn({
  initialData,
}: {
  /** First page prefetched by the route loader; `null` when signed out. */
  initialData?: { items: FeedItem[]; nextCursor: string | null; hasMore: boolean } | null;
} = {}) {
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [items, setItems] = useState<FeedItem[]>(initialData?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(!!initialData?.hasMore);
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const { t } = useTranslation('feed');

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
    // Loader already seeded the first page — don't refetch it on mount.
    if (seeded.current) return;
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
        <h1 className="text-lg font-bold text-site-text">{t("bookmarks-title", { defaultValue: "Bookmarks" })}</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Reveal className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <div className="rounded-site border border-site-border bg-site-surface p-4">
            <Bookmark className="h-8 w-8 text-site-text-muted" />
          </div>
          <p className="font-medium text-site-text">{t("no-bookmarks-yet", { defaultValue: "No bookmarks yet" })}</p>
          <p className="max-w-xs text-sm text-site-text-muted">
            {t("no-bookmarks-hint", { defaultValue: "Save posts from the “…” menu and they’ll show up here." })}
          </p>
        </Reveal>
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
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : t("load-more", { defaultValue: "Load more" })}
          </Button>
        </div>
      )}
    </div>
  );
}
