/**
 * Roadmap Route
 *
 * Header-less: the signature PinnedHero is this page's title, and it can only
 * pin with no `overflow-hidden` ancestor between it and the scroll root — so
 * the page takes `PageFrame` (the shared frame) rather than `PageLayout` (the
 * frame plus a title block that would sit above the hero).
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { RoadmapSection } from '@/components/roadmap/RoadmapSection';
import { PageFrame } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/roadmap')({
  head: () => ({
    meta: buildMeta({
      title: 'Roadmap | RMH Studios',
      description: 'The road ahead: games, community, immersive tech, and film.',
      path: '/roadmap',
    }),
    links: [buildCanonical('/roadmap')],
  }),
  component: RoadmapPage,
});

function RoadmapPage() {
  return (
    <PageFrame className="relative isolate min-h-screen">
      <RoadmapSection />
    </PageFrame>
  );
}
