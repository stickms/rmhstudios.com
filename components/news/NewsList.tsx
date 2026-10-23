'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Newspaper, X } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { Reveal } from '@/components/motion';
import { APPLE_SPRING } from '@/lib/motion';
import { NewsCard } from './NewsCard';
import { NewsHero } from './NewsHero';
import { NewsCategoryTabs } from './NewsCategoryTabs';
import type { NewsArticle } from '@/lib/news';

const ARTICLES_PER_PAGE = 12;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface NewsListProps {
  initialArticles: Partial<NewsArticle>[];
  featuredArticles: Partial<NewsArticle>[];
  filtersOpen?: boolean;
}

export function NewsList({
  initialArticles,
  featuredArticles,
  filtersOpen = false,
}: NewsListProps) {
  const { t } = useTranslation('c-news');
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;

  const [searchInput, setSearchInput] = useState(searchParams.q || '');
  const debouncedSearch = useDebounce(searchInput, 250);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    searchParams.category || null,
  );
  const [sortMode, setSortMode] = useState<'newest' | 'oldest'>(
    (searchParams.sort as 'newest' | 'oldest') || 'newest',
  );
  const [currentPage, setCurrentPage] = useState(Number(searchParams.page) || 1);
  const gridRef = useRef<HTMLDivElement>(null);

  const updateURL = useCallback(
    (params: Record<string, string | null>) => {
      const url = new URLSearchParams(window.location.search);
      Object.entries(params).forEach(([key, value]) => {
        if (
          value &&
          value !== '' &&
          !(key === 'page' && value === '1') &&
          !(key === 'sort' && value === 'newest')
        ) {
          url.set(key, value);
        } else {
          url.delete(key);
        }
      });
      const qs = url.toString();
      navigate({ to: `/news${qs ? `?${qs}` : ''}`, replace: true });
    },
    [navigate],
  );

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    initialArticles.forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [initialArticles]);

  const filteredArticles = useMemo(() => {
    let result = [...initialArticles];

    if (debouncedSearch) {
      const terms = debouncedSearch.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((a) =>
        terms.every(
          (term) =>
            a.title?.toLowerCase().includes(term) ||
            a.description?.toLowerCase().includes(term) ||
            a.tags?.some((t) => t.toLowerCase().includes(term)) ||
            a.category?.toLowerCase().includes(term),
        ),
      );
    }

    if (selectedCategory) {
      result = result.filter((a) => a.category === selectedCategory);
    }

    result.sort((a, b) => {
      const dateA = a.date ?? '';
      const dateB = b.date ?? '';
      return sortMode === 'newest' ? (dateA > dateB ? -1 : 1) : dateA > dateB ? 1 : -1;
    });

    return result;
  }, [initialArticles, debouncedSearch, selectedCategory, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
    updateURL({
      q: debouncedSearch || null,
      category: selectedCategory,
      sort: sortMode,
      page: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedCategory, sortMode]);

  const safePage = Math.min(currentPage, totalPages);
  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  const paginatedArticles = useMemo(() => {
    const start = (safePage - 1) * ARTICLES_PER_PAGE;
    return filteredArticles.slice(start, start + ARTICLES_PER_PAGE);
  }, [filteredArticles, safePage]);

  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(p);
      updateURL({
        q: debouncedSearch || null,
        category: selectedCategory,
        sort: sortMode,
        page: p > 1 ? String(p) : null,
      });
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [totalPages, updateURL, debouncedSearch, selectedCategory, sortMode],
  );

  const hasActiveFilters = searchInput || selectedCategory || sortMode !== 'newest';

  const clearAllFilters = () => {
    setSearchInput('');
    setSelectedCategory(null);
    setSortMode('newest');
  };

  return (
    <div className="px-4 pt-4 pb-12">
      {/* Featured Hero */}
      {!hasActiveFilters && featuredArticles.length > 0 && (
        <Reveal className="mb-[var(--site-section-gap)]">
          <NewsHero articles={featuredArticles} />
        </Reveal>
      )}

      {/* Filter Controls - collapsible */}
      {filtersOpen && (
        /* id is the target of the header's Filters button's aria-controls. */
        <div id="news-filters" className="mb-[var(--site-section-gap)] space-y-3">
          {/* Category Tabs */}
          <NewsCategoryTabs
            activeCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            availableCategories={availableCategories}
          />

          {/* Search + Sort Row */}
          <div className="glass-fill flex flex-col gap-3 rounded-site p-3">
            <SearchField
              value={searchInput}
              onValueChange={setSearchInput}
              placeholder={t('search-placeholder', { defaultValue: 'Search articles...' })}
              aria-label={t('search-placeholder', { defaultValue: 'Search articles...' })}
            />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor="news-sort" className="text-sm text-site-text-dim">
                {t('sort-label', { defaultValue: 'Sort:' })}
              </label>
              <Select
                id="news-sort"
                controlSize="sm"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}
              >
                <option value="newest">{t('sort-newest', { defaultValue: 'Newest' })}</option>
                <option value="oldest">{t('sort-oldest', { defaultValue: 'Oldest' })}</option>
              </Select>
              {hasActiveFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
                  <X aria-hidden /> {t('clear', { defaultValue: 'Clear' })}
                </Button>
              )}
              <span className="ms-auto font-mono text-sm text-site-text-dim">
                {t('article-count', {
                  count: filteredArticles.length,
                  defaultValue: '{{count}} article',
                  defaultValue_other: '{{count}} articles',
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active filter indicator when collapsed */}
      {!filtersOpen && hasActiveFilters && (
        <div className="mb-3 flex items-center gap-3 text-sm text-site-text-muted">
          <span className="font-mono">
            {t('results-count', {
              count: filteredArticles.length,
              defaultValue: '{{count}} results',
            })}
          </span>
          <Button type="button" variant="accent-ghost" size="sm" onClick={clearAllFilters}>
            {t('clear-filters', { defaultValue: 'Clear filters' })}
          </Button>
        </div>
      )}

      {/* Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--site-section-gap)] scroll-mt-8"
      >
        <AnimatePresence mode="popLayout">
          {paginatedArticles.map((article, i) => (
            <motion.div
              key={article.slug}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              // A spring, not a 0.25s tween: `layout` reflows the grid on every
              // filter change, and a card caught mid-move retargets from where it
              // is instead of restarting.
              transition={APPLE_SPRING.smooth}
            >
              <NewsCard article={article} index={i} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Canonical EmptyState, and it tells the truth about why the
                    grid is empty. It used to blame "your filters" and offer
                    "Clear All Filters" to readers who had set none —
                    `hasActiveFilters` was already computed right above. */}
        {filteredArticles.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={Newspaper}
              title={
                hasActiveFilters
                  ? t('no-articles', { defaultValue: 'No articles match your filters.' })
                  : t('no-articles-yet', { defaultValue: 'No articles yet' })
              }
              description={
                hasActiveFilters
                  ? t('no-articles-hint', {
                      defaultValue: 'Try a broader search or a different category.',
                    })
                  : t('no-articles-yet-hint', {
                      defaultValue: 'New writing from the studio will appear here.',
                    })
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={clearAllFilters}>
                    {t('clear-all-filters', { defaultValue: 'Clear all filters' })}
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          className="mt-[var(--site-section-gap)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Pagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
        </motion.div>
      )}
    </div>
  );
}
