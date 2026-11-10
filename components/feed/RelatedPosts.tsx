import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RMHarkCard } from './RMHarkCard';
import { Reveal } from '@/components/motion';
import type { FeedItem } from '@/lib/feed-types';
import { similarPostsApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';

/** Topically similar posts ("more like this"), shown under a post. */
export function RelatedPosts({ postId }: { postId: string }) {
  const { t } = useTranslation('feed');
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    let active = true;
    api(similarPostsApi, { params: { id: postId } })
      .then((d) => active && setItems(d.items ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [postId]);

  if (items.length === 0) return null;

  // The section is a sibling of the post and its replies in `.post-page`, so the
  // cards here sit on the same column and gutter as they do: no wrapper padding,
  // and `.post-page .social-post` drops the feed's own side margin (feed.css).
  // Section-level reveal: "more like this" fades up once when it scrolls into
  // view (below the fold on the detail page). The cards inside are NOT each
  // wrapped, which would violate the feed perf rules; only the section settles.
  return (
    <Reveal as="section" className="post-page__related">
      <h2 className="site-section-label">
        {t('related-posts', { defaultValue: 'Related posts' })}
      </h2>
      {items.map((item) => (
        <RMHarkCard key={item.id} item={item} />
      ))}
    </Reveal>
  );
}
