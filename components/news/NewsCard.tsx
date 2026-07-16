'use client';

import { Link } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import { Calendar, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCategoryColor } from '@/lib/news-categories';
import { NewsSourceBadge } from './NewsSourceBadge';
import { DUR_FAST, EASE_OUT_EXPO, STAGGER } from '@/components/motion';
import type { NewsArticle } from '@/lib/news';

interface NewsCardProps {
    article: Partial<NewsArticle>;
    index: number;
}

export function NewsCard({ article, index }: NewsCardProps) {
    const { t } = useTranslation("c-news");
    const categoryColor = getCategoryColor(article.category ?? '');

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR_FAST, delay: Math.min(index, 8) * STAGGER, ease: EASE_OUT_EXPO }}
            className="h-full"
        >
            <div
                data-slot="card"
                className="h-full bg-(--site-surface) border overflow-hidden hover:border-(--site-accent)/50 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] transition-[transform,border-color,box-shadow] duration-200 group relative flex flex-col"
                style={{
                    borderRadius: 'var(--site-radius)',
                    borderWidth: 'var(--site-border-width)',
                    borderColor: 'var(--site-border)',
                }}
            >
                <Link to={`/news/${article.slug}` as string} className="absolute inset-0 z-0" />

                {/* Category */}
                <div className="px-5 pt-5 pb-0 relative z-10 pointer-events-none">
                    <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${categoryColor.bg} ${categoryColor.text} ${categoryColor.border} border`}
                    >
                        {article.category}
                    </span>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1 relative pointer-events-none">
                    <h3 className="text-lg font-bold text-(--site-text) mb-2 leading-snug group-hover:text-(--site-accent) transition-colors line-clamp-2">
                        {article.title}
                    </h3>

                    <div className="flex items-center gap-2 text-(--site-text-dim) text-xs font-mono mb-3">
                        <Calendar className="w-3 h-3" />
                        {article.date}
                    </div>

                    <p className="text-(--site-text-muted) text-sm line-clamp-3 mb-4 leading-relaxed flex-1">
                        {article.description}
                    </p>

                    {/* Source */}
                    {article.sourcePublisher && article.sourceUrl && (
                        <div className="mb-4 pointer-events-auto">
                            <NewsSourceBadge
                                publisher={article.sourcePublisher}
                                url={article.sourceUrl}
                            />
                        </div>
                    )}

                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                            {article.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-(--site-bg) text-(--site-text-dim) border border-(--site-border)"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="mt-auto flex items-center gap-2 text-(--site-accent) text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                        {t("read-our-take", { defaultValue: "Read Our Take" })} <ArrowRight className="w-3 h-3" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
