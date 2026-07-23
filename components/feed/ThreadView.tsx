'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { RMHarkCard } from './RMHarkCard';
import { staggerContainer, staggerItem } from '@/lib/motion';
import type { FeedItem } from '@/lib/feed-types';

/** Renders an authored thread as a connected stack of the author's posts. */
export function ThreadView({ items }: { items: FeedItem[] }) {
  const { t } = useTranslation('feed');
  return (
    <div className="min-h-screen">
      <header className="site-sticky-chrome glass-chrome flex items-center gap-3 px-4 py-3">
        <Link
          to="/"
          className="rounded-site-sm p-1 text-site-text-muted hover:bg-site-surface hover:text-site-text"
          aria-label={t('back', { defaultValue: 'Back' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <MessagesSquare className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">
          {t('thread-title', { defaultValue: 'Thread' })}
        </h1>
        <span className="ml-auto text-xs text-site-text-dim">
          {t('thread-count', { defaultValue: '{{n}} posts', n: items.length })}
        </span>
      </header>

      {/* §5.48 staggered content entrance: the first ~8 posts fade-rise at 30ms
          steps; the tail mounts instantly (variants sliced to the head — no long
          tails). MotionConfig collapses this under reduced motion. */}
      <motion.div
        className="divide-y divide-site-border"
        variants={staggerContainer(0.03)}
        initial="initial"
        animate="animate"
      >
        {items.map((item, i) =>
          i < 8 ? (
            <motion.div key={item.id} variants={staggerItem}>
              <RMHarkCard item={item} />
            </motion.div>
          ) : (
            <div key={item.id}>
              <RMHarkCard item={item} />
            </div>
          ),
        )}
      </motion.div>
    </div>
  );
}
