import { getAllNewsArticles, getFeaturedNewsArticles } from '@/lib/news';
import { getSidebarData } from '@/lib/sidebar-data';
import { NewsRightSidebar } from './sidebar';
import { NewsPageContent } from './content';

export const revalidate = 60;

export const metadata = {
    title: 'News | RMH Studios',
    description:
        'Curated news and commentary on AI, gaming, neuroscience, tech, science, and culture from RMH Studios.',
};

export default async function NewsPage() {
    const articles = await getAllNewsArticles();
    const featured = await getFeaturedNewsArticles();
    const { researchArticles } = await getSidebarData();

    return (
        <NewsPageContent
            articles={articles}
            featured={featured}
            rightSidebar={<NewsRightSidebar featuredArticles={featured} researchArticles={researchArticles} />}
        />
    );
}
