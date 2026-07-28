import { useState, useRef, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { NewsList } from '@/components/news/NewsList';
import type { NewsArticle } from '@/lib/news';

interface NewsPageContentProps {
  articles: Partial<NewsArticle>[];
  featured: Partial<NewsArticle>[];
  rightSidebar?: React.ReactNode;
}

export function NewsPageContent({ articles, featured, rightSidebar }: NewsPageContentProps) {
  const { t } = useTranslation('c-news');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node)) return;
      // Don't close if clicking the toggle button
      const btn = document.getElementById('news-filter-toggle');
      if (btn?.contains(e.target as Node)) return;
      setFiltersOpen(false);
    }
    if (filtersOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filtersOpen]);

  return (
    <PageLayout
      title={t('news-title', { defaultValue: 'News' })}
      wide
      rightSidebar={rightSidebar}
      headerRight={
        // The page's only control was a 36×36 borderless glyph floating
        // ~900px from the title at d1920 — no label, no button chrome,
        // under the 44px floor. It is a labelled ghost Button now.
        <Button
          id="news-filter-toggle"
          variant={filtersOpen ? 'secondary' : 'ghost'}
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-pressed={filtersOpen}
          aria-expanded={filtersOpen}
          aria-controls="news-filters"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {t('filters', { defaultValue: 'Filters' })}
        </Button>
      }
    >
      <Suspense
        fallback={
          <div className="px-4 py-8 text-center text-site-text-muted">
            {t('loading', { defaultValue: 'Loading…' })}
          </div>
        }
      >
        <NewsList
          initialArticles={articles}
          featuredArticles={featured}
          filtersOpen={filtersOpen}
        />
      </Suspense>
    </PageLayout>
  );
}
