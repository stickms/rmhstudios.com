import { RoadmapSection } from "@/components/roadmap/RoadmapSection";
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { RoadmapRightSidebar } from './sidebar';

export const metadata = {
  title: "Roadmap | RMH Studios",
  description:
    "The road ahead: games, community, immersive tech, and film.",
};

export default function RoadmapPage() {
  const { newsArticles, researchArticles } = getSidebarData();

  return (
    <PageLayout
      title="Roadmap"
      rightSidebar={<RoadmapRightSidebar newsArticles={newsArticles} researchArticles={researchArticles} />}
    >
      <RoadmapSection />
    </PageLayout>
  );
}
