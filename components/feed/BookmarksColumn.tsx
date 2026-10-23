'use client';

import { useEffect, useState, useCallback, useRef } from'react';
import { useTranslation } from'react-i18next';
import { Bookmark, Loader2 } from'lucide-react';
import { VirtualPostList } from'./VirtualPostList';
import { ColumnHeader } from'./ColumnHeader';
import { AsyncReveal } from'@/components/motion';
import { Button } from'@/components/ui/button';
import { EmptyState } from'@/components/ui/empty-state';
import { Spinner } from'@/components/ui/spinner';
import type { FeedItem } from'@/lib/feed-types';

export function BookmarksColumn({
 initialData,
}: {
 /** First page prefetched by the route loader; `null`when signed out. */
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
 const res = await fetch(url.toString(), { credentials:'include'});
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
 <div>
 <ColumnHeader icon={Bookmark} title={t('bookmarks-title', { defaultValue:'Bookmarks'})} />

 {loading && (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 )}
 <AsyncReveal show={!loading}>
 {items.length === 0 ? (
 <EmptyState
 icon={Bookmark}
 title={t('no-bookmarks-yet', { defaultValue:'No bookmarks yet'})}
 description={t('no-bookmarks-hint', {
 defaultValue:'Save posts from the “…” menu and they’ll show up here.',
 })}
 />
 ) : (
 <VirtualPostList items={items} />
 )}
 </AsyncReveal>

 {hasMore && (
 <div className="flex justify-center py-4">
 <Button variant="secondary"size="sm"onClick={loadMore} disabled={loadingMore}>
 {loadingMore ? (
 <Loader2 className="h-4 w-4 animate-spin"/>
 ) : (
 t('load-more', { defaultValue:'Load more'})
 )}
 </Button>
 </div>
 )}
 </div>
 );
}
