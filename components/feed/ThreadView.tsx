import { useTranslation } from 'react-i18next';
import { PageLayout } from './PageLayout';
import { RMHarkCard } from './RMHarkCard';
import { Spine } from '@/components/ui/spine';
import type { FeedItem } from '@/lib/feed-types';

/**
 * Renders an authored thread as the author's posts on one spine (Steel section 10): a titled page, one dot per post,
 * oldest first. The page frame is `PageLayout`'s, so the route does not wrap this in a second one.
 */
export function ThreadView({ items }: { items: FeedItem[] }) {
  const { t } = useTranslation('feed');
  return (
    <PageLayout
      title={t('thread-title', { defaultValue: 'Thread' })}
      backTo="/"
      backLabel={t('back', { defaultValue: 'Back' })}
      headerRight={
        <span className="t-meta">
          {t('thread-count', { defaultValue: '{{n}} posts', n: items.length })}
        </span>
      }
    >
      <Spine>
        {items.map((item) => (
          <RMHarkCard key={item.id} item={item} />
        ))}
      </Spine>
    </PageLayout>
  );
}
