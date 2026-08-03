/**
 * Roadmap Route
 *
 * Store-style layout: drops the PageLayout chrome and wraps the roadmap in
 * `AnimatedMain` (like /store) so the signature PinnedHero can pin without an
 * `overflow-hidden` ancestor between it and the scroll root.
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { RoadmapSection } from '@/components/roadmap/RoadmapSection';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

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
    <>
      <AnimatedMain className="relative isolate min-h-screen w-full min-w-0 pb-dock">
        <RoadmapSection />
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library/store layout. */}
      <ContextRail reserve />
    </>
  );
}
