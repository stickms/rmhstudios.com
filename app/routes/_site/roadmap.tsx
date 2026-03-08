/**
 * Roadmap Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { RoadmapSection } from '@/components/roadmap/RoadmapSection';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/roadmap')({
  head: () => ({
    meta: [
      { title: 'Roadmap | RMH Studios' },
      { name: 'description', content: 'The road ahead: games, community, immersive tech, and film.' },
    ],
  }),
  component: RoadmapPage,
});

function RoadmapPage() {
  return (
    <PageLayout title="Roadmap" wide>
      <RoadmapSection />
    </PageLayout>
  );
}
