'use client';

import { Link } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import { Calendar, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getCategoryColor } from '@/lib/news-categories';
import { NewsSourceBadge } from './NewsSourceBadge';
import { DUR_FAST, EASE_OUT_EXPO, STAGGER } from '@/components/motion';
import { useLiquidLink } from '@/hooks/useLiquidLink';
import { liquidVTName } from '@/lib/view-transition';
import type { NewsArticle } from '@/lib/news';

interface NewsCardProps {
  article: Partial<NewsArticle>;
  index: number;
}

export function NewsCard({ article, index }: NewsCardProps) {
  const { t } = useTranslation('c-news');
  const categoryColor = getCategoryColor(article.category ?? '');
  const liquidOpen = useLiquidLink();
  const slug = article.slug ?? '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR_FAST, delay: Math.min(index, 8) * STAGGER, ease: EASE_OUT_EXPO }}
      className="h-full"
    >
      {/* A repeated tile: the L1 fill via Card (interactive = hover tint-raise +
          press flex). One padding value (`p-4`/`sm:p-5`) owns the inside — the
          old card stacked a `px-5 pt-5` category row on a second `p-5` body. */}
      <Card
        interactive
        className="group relative h-full gap-3 py-4 sm:gap-3 sm:py-5"
      >
        {/* §5.48: the overlay link's box == the card, so tagging it at
            click time morphs the whole card into the article header. */}
        <Link
          to={`/news/${article.slug}` as string}
          onClick={(e) => liquidOpen(e, liquidVTName('news', slug), { to: `/news/${slug}` })}
          className="absolute inset-0 z-0 rounded-site"
        >
          <span className="sr-only">{article.title}</span>
        </Link>

        <div className="pointer-events-none relative flex flex-1 flex-col gap-3 px-4 sm:px-5">
          {article.category && (
            <div>
              <Badge
                size="sm"
                className={`${categoryColor.bg} ${categoryColor.text} ${categoryColor.border}`}
              >
                {article.category}
              </Badge>
            </div>
          )}

          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-site-text transition-colors group-hover:text-site-accent">
            {article.title}
          </h3>

          <div className="flex items-center gap-2 font-mono text-xs text-site-text-dim">
            <Calendar className="size-3" aria-hidden />
            {article.date}
          </div>

          <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-site-text-muted">
            {article.description}
          </p>

          {article.sourcePublisher && article.sourceUrl && (
            <div className="pointer-events-auto relative z-10">
              <NewsSourceBadge publisher={article.sourcePublisher} url={article.sourceUrl} />
            </div>
          )}

          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {article.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} size="sm" variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 text-xs font-semibold text-site-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {t('read-our-take-news-card', { defaultValue: 'Read Our Take' })}{' '}
            <ArrowRight className="size-3" aria-hidden />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
