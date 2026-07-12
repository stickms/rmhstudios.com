'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RMHarkCard } from './RMHarkCard';
import { Reveal } from '@/components/motion';
import type { FeedItem } from '@/lib/feed-types';

/** Topically similar posts ("more like this"), shown under a post. */
export function RelatedPosts({ postId }: { postId: string }) {
  const { t } = useTranslation('feed');
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/rmharks/${postId}/similar`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => active && setItems(d.items ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [postId]);

  if (items.length === 0) return null;

  // Section-level reveal: "more like this" fades up once when it scrolls into
  // view (below the fold on the detail page). The cards inside are NOT each
  // wrapped — that would violate the feed perf rules; only the section settles.
  return (
    <Reveal as="section" className="border-t border-site-border">
      <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t("related-posts", { defaultValue: "Related posts" })}</h2>
      <div className="divide-y divide-site-border">
        {items.map((item) => (
          <RMHarkCard key={item.id} item={item} />
        ))}
      </div>
    </Reveal>
  );
}
