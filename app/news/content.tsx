'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { NewsList } from '@/components/news/NewsList';
import type { NewsArticle } from '@/lib/news';

interface NewsPageContentProps {
    articles: Partial<NewsArticle>[];
    featured: Partial<NewsArticle>[];
    rightSidebar: React.ReactNode;
}

export function NewsPageContent({ articles, featured, rightSidebar }: NewsPageContentProps) {
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
            title="News"
            rightSidebar={rightSidebar}
            headerRight={
                <button
                    id="news-filter-toggle"
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className={`p-2 rounded-lg transition-colors ${
                        filtersOpen
                            ? 'text-site-accent bg-site-accent-dim'
                            : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
                    }`}
                    title="Toggle filters"
                >
                    <SlidersHorizontal className="w-5 h-5" />
                </button>
            }
        >
            <Suspense fallback={<div className="px-4 py-8 text-center text-site-text-dim">Loading...</div>}>
                <NewsList
                    initialArticles={articles}
                    featuredArticles={featured}
                    filtersOpen={filtersOpen}
                />
            </Suspense>
        </PageLayout>
    );
}
