import { RoadmapSection } from "@/components/roadmap/RoadmapSection";
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { RoadmapRightSidebar } from './sidebar';

export const metadata = {
  title: "Roadmap | RMH Studios",
  description:
    "The road ahead: games, community, immersive tech, and film.",
};

export const revalidate = 60;

export default async function RoadmapPage() {
  return (
    <PageLayout
      title="Roadmap"
      wide
    >
      <RoadmapSection />
    </PageLayout>
  );
}
