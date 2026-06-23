/**
 * Roadmap Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation("site");
  return (
    <PageLayout title={t("roadmap-title", { defaultValue: "Roadmap" })} wide>
      <RoadmapSection />
    </PageLayout>
  );
}
