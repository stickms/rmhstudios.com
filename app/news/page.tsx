import { getAllNewsArticles, getFeaturedNewsArticles } from '@/lib/news';
import { getSidebarData } from '@/lib/sidebar-data';
import { NewsRightSidebar } from './sidebar';
import { NewsPageContent } from './content';

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
    const { researchArticles } = getSidebarData();

    return (
        <NewsPageContent
            articles={articles}
            featured={featured}
            rightSidebar={<NewsRightSidebar featuredArticles={featured} researchArticles={researchArticles} />}
        />
    );
}
