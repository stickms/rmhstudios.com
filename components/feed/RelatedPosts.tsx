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
  // §16.3.3: the cards use the feed's floating-card grammar — `space-y-3` gaps +
  // `px-3` side gutters (matching FeedList) — instead of the old flush
  // `divide-y` stack, so "more like this" reads like the feed, not a table.
  return (
    <Reveal as="section" className="border-t border-site-border pt-3">
      <h2 className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t("related-posts", { defaultValue: "Related posts" })}</h2>
      <div className="space-y-3 px-3 pb-3">
        {items.map((item) => (
          <RMHarkCard key={item.id} item={item} />
        ))}
      </div>
    </Reveal>
  );
}
