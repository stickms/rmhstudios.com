'use client';

/** N2 — the community hall of fame: posts at or above the ⭐ threshold. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { VirtualPostList } from '@/components/feed/VirtualPostList';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import type { FeedItem } from '@/lib/feed-types';

interface Page {
  items: FeedItem[];
  nextCursor: string | null;
  threshold: number;
}

export default function HallOfFamePanel({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(5);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (from: string | null) => {
      const url =
        communityApi(slug, '/starboard') + (from ? `?cursor=${encodeURIComponent(from)}` : '');
      const res = await plusFetch<Page>(url);
      return res.data;
    },
    [slug],
  );

  useEffect(() => {
    let cancelled = false;
    void load(null).then((p) => {
      if (cancelled) return;
      setItems(p?.items ?? []);
      setCursor(p?.nextCursor ?? null);
      if (p) setThreshold(p.threshold);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!items) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <p className="px-4 py-3 text-xs text-site-text-muted">
        {t('fame-hint', {
          n: threshold,
          defaultValue: 'Posts that collect {{n}} or more ⭐ reactions land here.',
        })}
      </p>
      {items.length === 0 ? (
        <EmptyState
          icon={Star}
          title={t('fame-empty', { defaultValue: 'No hall of fame posts yet' })}
          description={t('fame-empty-desc', {
            defaultValue: 'React with ⭐ on a great post to help it get here.',
          })}
        />
      ) : (
        <VirtualPostList items={items} />
      )}
      {cursor && (
        <div className="flex justify-center py-4">
          <Button
            variant="secondary"
            size="sm"
            loading={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              const p = await load(cursor);
              setLoadingMore(false);
              if (p) {
                setItems((cur) => [...(cur ?? []), ...p.items]);
                setCursor(p.nextCursor);
              }
            }}
          >
            {t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
    </div>
  );
}
