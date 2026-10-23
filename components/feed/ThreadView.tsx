'use client';

import { useTranslation } from'react-i18next';
import { Link } from'@tanstack/react-router';
import { ArrowLeft } from'lucide-react';
import { m as motion } from'framer-motion';
import { RMHarkCard } from'./RMHarkCard';
import { staggerContainer, staggerItem } from'@/lib/motion';
import type { FeedItem } from'@/lib/feed-types';

/** Renders an authored thread as a connected stack of the author's posts. */
export function ThreadView({ items }: { items: FeedItem[] }) {
 const { t } = useTranslation('feed');
 return (
 <div>
 <header data-slot="page-header" className="page-heading">
 <div className="page-heading__meta">
 <Link to="/" className="page-heading__back" aria-label={t('back', { defaultValue:'Back'})}>
 <ArrowLeft aria-hidden />
 <span>{t('back', { defaultValue:'Back'})}</span>
 </Link>
 </div>
 <div className="page-heading__content">
 <div className="min-w-0">
 <h1 className="site-display-3">
 <span className="min-w-0 truncate">{t('thread-title', { defaultValue:'Thread'})}</span>
 </h1>
 </div>
 <div data-slot="page-header-action" className="text-xs text-site-text-dim">
 {t('thread-count', { defaultValue:'{{n}} posts', n: items.length })}
 </div>
 </div>
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
