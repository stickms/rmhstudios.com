'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Reveal } from '@/components/motion';
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

export function NewsList({ initialArticles, featuredArticles, filtersOpen = false }: NewsListProps) {
    const { t } = useTranslation("c-news");
    const navigate = useNavigate();
    const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;

    const [searchInput, setSearchInput] = useState(searchParams.q || '');
    const debouncedSearch = useDebounce(searchInput, 250);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(searchParams.category || null);
    const [sortMode, setSortMode] = useState<'newest' | 'oldest'>((searchParams.sort as 'newest' | 'oldest') || 'newest');
    const [currentPage, setCurrentPage] = useState(Number(searchParams.page) || 1);
    const gridRef = useRef<HTMLDivElement>(null);

    const updateURL = useCallback(
        (params: Record<string, string | null>) => {
            const url = new URLSearchParams(window.location.search);
            Object.entries(params).forEach(([key, value]) => {
                if (value && value !== '' && !(key === 'page' && value === '1') && !(key === 'sort' && value === 'newest')) {
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
        updateURL({ q: debouncedSearch || null, category: selectedCategory, sort: sortMode, page: null });
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
            updateURL({ q: debouncedSearch || null, category: selectedCategory, sort: sortMode, page: p > 1 ? String(p) : null });
            gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        [totalPages, updateURL, debouncedSearch, selectedCategory, sortMode],
    );

    const pageNumbers = useMemo(() => {
        const pages: (number | '...')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (safePage > 3) pages.push('...');
            for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
            if (safePage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    }, [totalPages, safePage]);

    const hasActiveFilters = searchInput || selectedCategory || sortMode !== 'newest';

    const clearAllFilters = () => {
        setSearchInput('');
        setSelectedCategory(null);
        setSortMode('newest');
    };

    return (
        <div className="px-4 py-4">
            {/* Featured Hero */}
            {!hasActiveFilters && featuredArticles.length > 0 && (
                <Reveal className="mb-4">
                    <NewsHero articles={featuredArticles} />
                </Reveal>
            )}

            {/* Filter Controls - collapsible */}
            {filtersOpen && (
                <div className="mb-4 space-y-3 border-b border-(--site-border) pb-4">
                    {/* Category Tabs */}
                    <NewsCategoryTabs activeCategory={selectedCategory} onCategoryChange={setSelectedCategory} availableCategories={availableCategories} />

                    {/* Search + Sort Row */}
                    <div className="flex flex-col gap-3 bg-(--site-surface) p-3 rounded-site border border-(--site-border)">
                        <div className="relative w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-(--site-text-dim)" />
                            </div>
                            <input
                                type="text"
                                placeholder={t("search-placeholder", { defaultValue: "Search articles..." })}
                                className="w-full bg-(--site-bg) border border-(--site-border) rounded-site-sm py-2 pl-9 pr-9 text-sm text-(--site-text) placeholder-(--site-text-dim) focus:outline-none focus:border-(--site-accent) focus:ring-1 focus:ring-(--site-accent) transition-all"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                            {searchInput && (
                                <button
                                    onClick={() => setSearchInput('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-(--site-text-dim) hover:text-(--site-text) transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3 whitespace-nowrap">
                            {hasActiveFilters && (
                                <button onClick={clearAllFilters} className="text-xs text-(--site-danger) hover:text-(--site-text) transition-colors font-mono flex items-center gap-1">
                                    <X className="w-3 h-3" /> {t("clear", { defaultValue: "Clear" })}
                                </button>
                            )}
                            <label htmlFor="news-sort" className="text-sm text-(--site-text-dim)">{t("sort-label", { defaultValue: "Sort:" })}</label>
                            <Select
                                id="news-sort"
                                controlSize="sm"
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}
                            >
                                <option value="newest">{t("sort-newest", { defaultValue: "Newest" })}</option>
                                <option value="oldest">{t("sort-oldest", { defaultValue: "Oldest" })}</option>
                            </Select>
                            <span className="text-sm text-(--site-text-dim) font-mono ml-auto">
                                {t("article-count", { count: filteredArticles.length, defaultValue: "{{count}} article", defaultValue_other: "{{count}} articles" })}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Active filter indicator when collapsed */}
            {!filtersOpen && hasActiveFilters && (
                <div className="mb-3 flex items-center gap-2 text-xs text-(--site-text-dim)">
                    <span className="font-mono">{t("results-count", { count: filteredArticles.length, defaultValue: "{{count}} results" })}</span>
                    <button onClick={clearAllFilters} className="text-(--site-accent) hover:underline">{t("clear-filters", { defaultValue: "Clear filters" })}</button>
                </div>
            )}

            {/* Grid */}
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 scroll-mt-8">
                <AnimatePresence mode="popLayout">
                    {paginatedArticles.map((article, i) => (
                        <motion.div key={article.slug} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}>
                            <NewsCard article={article} index={i} />
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredArticles.length === 0 && (
                    <div className="col-span-full text-center py-20 text-(--site-text-dim)">
                        <p className="text-lg">{t("no-articles", { defaultValue: "No articles found matching your filters." })}</p>
                        <button onClick={clearAllFilters} className="mt-4 text-(--site-accent) hover:underline">
                            {t("clear-all-filters", { defaultValue: "Clear All Filters" })}
                        </button>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <motion.div className="mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    <Pagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
                </motion.div>
            )}
        </div>
    );
}
