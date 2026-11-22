/**
 * The "Pinned" block above a community's feed (s09-06): up to three posts the moderators keep at the top, as rows on
 * rules, each marked "Pinned" in `t-meta`. The route loader hands over the first read, so it is there on first paint;
 * a pin or unpin from a post menu invalidates the query and the block follows.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MemoRMHarkCard } from '@/components/feed/VirtualPostList';
import { apiQuery } from '@/lib/contract/client';
import { getCommunityPinsApi, type CommunityPinsDTO } from '@/lib/communities/pins.contract';
import { PIN_LIMIT } from '@/lib/communities/pins';
import type { FeedItem } from '@/lib/feed-types';

/**
 * The community's pins. `initial` (from the loader) shows at once; it is marked stale from the start, so a post menu
 * that opens reads the real order and the viewer's role, while the block itself does not refetch on mount.
 */
export function useCommunityPins(slug: string, initial: FeedItem[] | null | undefined): CommunityPinsDTO | undefined {
  const seed: CommunityPinsDTO | undefined = initial
    ? { items: initial, order: initial.map((i) => i.id), canModerate: false, limit: PIN_LIMIT }
    : undefined;
  const query = useQuery({
    ...apiQuery(getCommunityPinsApi, { params: { slug } }),
    ...(seed ? { initialData: seed, initialDataUpdatedAt: 0 } : {}),
    staleTime: Infinity,
    refetchOnMount: seed ? false : true,
    retry: false,
  });
  return query.data;
}

export function PinnedPosts({ items }: { items: FeedItem[] }) {
  const { t } = useTranslation('community-pins');
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="community-pinned-heading" className="border-b border-site-border">
      <h2 id="community-pinned-heading" className="t-label px-4 pt-3 pb-1">
        {t('block-title', { defaultValue: 'Pinned' })}
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-t border-site-border first:border-t-0">
            <p className="t-meta px-4 pt-3">{t('marker', { defaultValue: 'Pinned' })}</p>
            <MemoRMHarkCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
