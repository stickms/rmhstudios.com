import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RMHarkCard } from './RMHarkCard';
import { SpineStation } from '@/components/ui/spine';
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

  // A station on the thread's spine, then the posts as items on it. A fragment: the caller owns the `Spine`.
  return (
    <>
      <SpineStation>{t('related-posts', { defaultValue: 'Related posts' })}</SpineStation>
      {items.map((item) => (
        <RMHarkCard key={item.id} item={item} />
      ))}
    </>
  );
}
