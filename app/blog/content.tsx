'use client';

import { useState, Suspense } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { BlogList } from '@/components/blog/BlogList';
import type { Post } from '@/lib/blog';

interface BlogPageContentProps {
    posts: Partial<Post>[];
    rightSidebar: React.ReactNode;
}

export function BlogPageContent({ posts, rightSidebar }: BlogPageContentProps) {
    const [filtersOpen, setFiltersOpen] = useState(false);

    return (
        <PageLayout
            title="The Archive"
            rightSidebar={rightSidebar}
            headerRight={
                <button
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
                <BlogList initialPosts={posts} filtersOpen={filtersOpen} />
            </Suspense>
        </PageLayout>
    );
}
