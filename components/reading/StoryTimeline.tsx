'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getCategoryColor } from '@/lib/news-categories';
import type { StoryPageData } from '@/lib/reading/schema';

/** L5 — the story page: summary, then the articles in date order. */
export function StoryTimeline({
  story,
}: {
  story: Pick<StoryPageData, 'title' | 'summary' | 'articles'>;
}) {
  const { t } = useTranslation('f-reading');
  return (
    <PageLayout
      title={story.title}
      description={story.summary || undefined}
      backTo="/news"
      backLabel={t('back-to-news', { defaultValue: 'Back to News' })}
      wrapTitle
    >
      <div className="px-4 pt-4 pb-12">
        {story.articles.length === 0 ? (
          <EmptyState
            title={t('story-empty', { defaultValue: 'No published articles in this story yet' })}
          />
        ) : (
          <ol
            className="relative space-y-[var(--site-section-gap)] border-s-2 border-site-border ps-6"
            aria-label={t('story-timeline', { defaultValue: 'Story timeline' })}
          >
            {story.articles.map((a, i) => {
              const color = getCategoryColor(a.category);
              return (
                <li key={a.slug} className="relative">
                  <span
                    aria-hidden
                    className="absolute -start-[1.95rem] top-2 size-3 rounded-full glass-inset border-2 border-site-accent bg-site-bg"
                  />
                  <time dateTime={a.date} className="font-mono text-sm text-site-accent">
                    {a.date}
                  </time>
                  <Link
                    to="/news/$slug"
                    params={{ slug: a.slug }}
                    className="glass-fill glass-interactive mt-2 block rounded-site px-4 py-3"
                  >
                    <Badge size="sm" className={`mb-2 ${color.bg} ${color.text} ${color.border}`}>
                      {a.category}
                    </Badge>
                    <h2 className="text-lg font-semibold leading-snug text-site-text">{a.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-site-text-muted">
                      {a.description}
                    </p>
                    {i === 0 ? (
                      <span className="mt-3 block text-xs font-semibold text-site-text-dim">
                        {t('story-first', { defaultValue: 'Where the story starts' })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </PageLayout>
  );
}
