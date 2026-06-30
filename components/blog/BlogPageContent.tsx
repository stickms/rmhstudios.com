import { useState, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { BlogList } from '@/components/blog/BlogList';
import type { Post } from '@/lib/blog';

interface BlogPageContentProps {
    posts: Partial<Post>[];
    rightSidebar?: React.ReactNode;
}

export function BlogPageContent({ posts, rightSidebar }: BlogPageContentProps) {
    const { t } = useTranslation("c-blog");
    const [filtersOpen, setFiltersOpen] = useState(false);

    return (
        <PageLayout
            title={t("the-archive", { defaultValue: "The Archive" })}
            wide
            rightSidebar={rightSidebar}
            headerRight={
                <button
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    aria-pressed={filtersOpen}
                    aria-label={t("toggle-filters", { defaultValue: "Toggle filters" })}
                    className={`p-2 rounded-site-sm active:scale-95 transition-[transform,color,background-color] duration-150 ${
                        filtersOpen
                            ? 'text-site-accent bg-site-accent-dim'
                            : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
                    }`}
                    title={t("toggle-filters", { defaultValue: "Toggle filters" })}
                >
                    <SlidersHorizontal className="w-5 h-5" />
                </button>
            }
        >
            <Suspense fallback={<div className="px-4 py-8 text-center text-site-text-dim">{t("loading", { defaultValue: "Loading..." })}</div>}>
                <BlogList initialPosts={posts} filtersOpen={filtersOpen} />
            </Suspense>
        </PageLayout>
    );
}
