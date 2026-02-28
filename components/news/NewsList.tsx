'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
}

export function NewsList({ initialArticles, featuredArticles }: NewsListProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
    const debouncedSearch = useDebounce(searchInput, 250);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(searchParams.get('category') || null);
    const [sortMode, setSortMode] = useState<'newest' | 'oldest'>((searchParams.get('sort') as 'newest' | 'oldest') || 'newest');
    const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
    const gridRef = useRef<HTMLDivElement>(null);

    const updateURL = useCallback(
        (params: Record<string, string | null>) => {
            const url = new URLSearchParams(searchParams.toString());
            Object.entries(params).forEach(([key, value]) => {
                if (value && value !== '' && !(key === 'page' && value === '1') && !(key === 'sort' && value === 'newest')) {
                    url.set(key, value);
                } else {
                    url.delete(key);
                }
            });
            const qs = url.toString();
            router.replace(`/news${qs ? `?${qs}` : ''}`, { scroll: false });
        },
        [router, searchParams],
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
        <div className="container mx-auto max-w-6xl relative z-10">
            {/* Header */}
            <motion.div className="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Link href="/" className="inline-flex items-center gap-2 text-(--site-text-dim) hover:text-(--site-text) mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                </Link>
                <h1
                    className="text-4xl md:text-6xl font-black tracking-tighter text-(--site-text) mb-4"
                    style={{ fontFamily: 'var(--site-font-display)', textShadow: 'var(--site-text-shadow)', letterSpacing: 'var(--site-letter-spacing)' }}
                >
                    RMH <span className="text-(--site-accent)">News</span>
                </h1>
                <p className="text-(--site-text-muted) text-lg max-w-2xl">
                    Curated news and commentary on AI, gaming, neuroscience, tech, science, and culture.
                </p>
            </motion.div>

            {/* Featured Hero */}
            {!hasActiveFilters && featuredArticles.length > 0 && <NewsHero articles={featuredArticles} />}

            {/* Controls */}
            <motion.div className="mb-8 space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                {/* Category Tabs */}
                <NewsCategoryTabs activeCategory={selectedCategory} onCategoryChange={setSelectedCategory} availableCategories={availableCategories} />

                {/* Search + Sort Row */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-(--site-surface) p-4 rounded-xl border border-(--site-border)">
                    <div className="relative w-full sm:w-80">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-(--site-text-dim)" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search articles..."
                            className="w-full bg-(--site-bg) border border-(--site-border) rounded-lg py-2 pl-9 pr-9 text-sm text-(--site-text) placeholder-(--site-text-dim) focus:outline-none focus:border-(--site-accent) focus:ring-1 focus:ring-(--site-accent) transition-all"
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

                    <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
                        {hasActiveFilters && (
                            <button onClick={clearAllFilters} className="text-xs text-(--site-danger) hover:text-(--site-text) transition-colors font-mono flex items-center gap-1">
                                <X className="w-3 h-3" /> Clear
                            </button>
                        )}
                        <span className="text-sm text-(--site-text-dim)">Sort:</span>
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}
                            className="bg-(--site-bg) border border-(--site-border) rounded-lg py-1 px-3 text-sm text-(--site-text) focus:outline-none focus:border-(--site-accent)"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                        </select>
                        <span className="text-sm text-(--site-text-dim) font-mono">
                            {filteredArticles.length} {filteredArticles.length === 1 ? 'article' : 'articles'}
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* Grid */}
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 scroll-mt-8">
                <AnimatePresence mode="popLayout">
                    {paginatedArticles.map((article, i) => (
                        <motion.div key={article.slug} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}>
                            <NewsCard article={article} index={i} />
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredArticles.length === 0 && (
                    <div className="col-span-full text-center py-20 text-(--site-text-dim)">
                        <p className="text-lg">No articles found matching your filters.</p>
                        <button onClick={clearAllFilters} className="mt-4 text-(--site-accent) hover:underline">
                            Clear All Filters
                        </button>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <motion.div className="mt-12 flex flex-col items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <button onClick={() => goToPage(1)} disabled={safePage === 1} className="p-2 rounded-lg text-(--site-text-dim) hover:text-(--site-text) hover:bg-(--site-surface) disabled:opacity-20 disabled:cursor-not-allowed transition-all" aria-label="First page">
                            <ChevronsLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => goToPage(safePage - 1)} disabled={safePage === 1} className="p-2 rounded-lg text-(--site-text-dim) hover:text-(--site-text) hover:bg-(--site-surface) disabled:opacity-20 disabled:cursor-not-allowed transition-all" aria-label="Previous page">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {pageNumbers.map((page, i) =>
                            page === '...' ? (
                                <span key={`ellipsis-${i}`} className="px-2 text-(--site-text-dim) text-sm">
                                    ...
                                </span>
                            ) : (
                                <button
                                    key={page}
                                    onClick={() => goToPage(page as number)}
                                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${safePage === page ? 'bg-(--site-accent) text-white' : 'text-(--site-text-dim) hover:text-(--site-text) hover:bg-(--site-surface)'}`}
                                >
                                    {page}
                                </button>
                            ),
                        )}
                        <button onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages} className="p-2 rounded-lg text-(--site-text-dim) hover:text-(--site-text) hover:bg-(--site-surface) disabled:opacity-20 disabled:cursor-not-allowed transition-all" aria-label="Next page">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button onClick={() => goToPage(totalPages)} disabled={safePage === totalPages} className="p-2 rounded-lg text-(--site-text-dim) hover:text-(--site-text) hover:bg-(--site-surface) disabled:opacity-20 disabled:cursor-not-allowed transition-all" aria-label="Last page">
                            <ChevronsRight className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-(--site-text-dim) font-mono">
                        Page {safePage} of {totalPages}
                    </p>
                </motion.div>
            )}
        </div>
    );
}
