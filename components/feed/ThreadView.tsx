'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import type { FeedItem } from '@/lib/feed-types';

/** Renders an authored thread as a connected stack of the author's posts. */
export function ThreadView({ items }: { items: FeedItem[] }) {
  const { t } = useTranslation('feed');
  return (
    <div className="min-h-screen">
      <header className="sticky top-2 z-10 mx-2 flex items-center gap-2 rounded-site glass-chrome px-4 py-3 shadow-site-sm md:top-3 md:mx-3">
        <Link
          to="/"
          className="rounded-site-sm p-1 text-site-text-muted hover:bg-site-surface hover:text-site-text"
          aria-label={t('back', { defaultValue: 'Back' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <MessagesSquare className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('thread-title', { defaultValue: 'Thread' })}</h1>
        <span className="ml-auto text-xs text-site-text-dim">
          {t('thread-count', { defaultValue: '{{n}} posts', n: items.length })}
        </span>
      </header>

      <div className="divide-y divide-site-border">
        {items.map((item) => (
          <RMHarkCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
