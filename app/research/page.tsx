import { getAllArticles } from '@/lib/research';
import { ResearchList } from '@/components/research/ResearchList';
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { ResearchRightSidebar } from './sidebar';

export const metadata = {
  title: 'Research | RMH Studios',
  description:
    'Peer-reviewed research from RMH Studios on AI, neuroscience, and gaming psychology.',
};

export const revalidate = 60;

export default async function ResearchPage() {
  const articles = getAllArticles();
  const { newsArticles } = await getSidebarData();

  return (
    <PageLayout
      title="Research"
      rightSidebar={<ResearchRightSidebar newsArticles={newsArticles} />}
    >
      <div className="px-4 py-4 space-y-4">
        <p className="text-site-text-muted text-sm">
          Peer-reviewed investigations at the intersection of gaming,
          artificial intelligence, and cognitive science.
        </p>
        <ResearchList articles={articles} />
      </div>
    </PageLayout>
  );
}
