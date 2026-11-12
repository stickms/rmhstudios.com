import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { Spine } from '@/components/ui/spine';
import type { FeedItem } from '@/lib/feed-types';

/** Renders an authored thread as a connected stack of the author's posts. */
export function ThreadView({ items }: { items: FeedItem[] }) {
  const { t } = useTranslation('feed');
  return (
    <div>
      <header data-slot="page-header" className="page-heading">
        <div className="page-heading__meta">
          <Link
            to="/"
            className="page-heading__back"
            aria-label={t('back', { defaultValue: 'Back' })}
          >
            <ArrowLeft aria-hidden />
            <span>{t('back', { defaultValue: 'Back' })}</span>
          </Link>
        </div>
        <div className="page-heading__content">
          <div className="min-w-0">
            <h1 className="site-display-3">
              <span className="min-w-0 truncate">
                {t('thread-title', { defaultValue: 'Thread' })}
              </span>
            </h1>
          </div>
          <div data-slot="page-header-action" className="text-xs text-site-text-muted">
            {t('thread-count', { defaultValue: '{{n}} posts', n: items.length })}
          </div>
        </div>
      </header>

      <Spine>
        {items.map((item) => (
          <RMHarkCard key={item.id} item={item} />
        ))}
      </Spine>
    </div>
  );
}
