import { Suspense } from 'react';
import { getAllNewsArticles, getFeaturedNewsArticles } from '@/lib/news';
import { NewsList } from '@/components/news/NewsList';

export const metadata = {
    title: 'News | RMH Studios',
    description:
        'Curated news and commentary on AI, gaming, neuroscience, tech, science, and culture from RMH Studios.',
};

const NEWS_FIELDS = [
    'title', 'date', 'slug', 'description', 'category',
    'tags', 'featured', 'sourceTitle', 'sourceUrl',
    'sourcePublisher', 'sourceDate', 'image',
] as const;

export default function NewsPage() {
    const articles = getAllNewsArticles([...NEWS_FIELDS]);
    const featured = getFeaturedNewsArticles([...NEWS_FIELDS]);

    return (
        <main className="min-h-screen pt-24 md:pt-28 pb-20 px-4 bg-(--site-bg) relative overflow-hidden">
            <Suspense
                fallback={
                    <div className="container mx-auto max-w-6xl relative z-10 text-center py-20">
                        <div className="text-(--site-text-dim) animate-pulse">Loading news...</div>
                    </div>
                }
            >
                <NewsList initialArticles={articles} featuredArticles={featured} />
            </Suspense>
        </main>
    );
}
