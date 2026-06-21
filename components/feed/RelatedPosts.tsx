'use client';

import { useEffect, useState } from 'react';
import { RMHarkCard } from './RMHarkCard';
import type { FeedItem } from '@/lib/feed-types';

/** Topically similar posts ("more like this"), shown under a post. */
export function RelatedPosts({ postId }: { postId: string }) {
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

  return (
    <section className="border-t border-site-border">
      <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Related posts</h2>
      <div className="divide-y divide-site-border">
        {items.map((item) => (
          <RMHarkCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
