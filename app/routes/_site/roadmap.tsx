/**
 * Roadmap Route
 *
 * Store-style layout: drops the PageLayout chrome and wraps the roadmap in
 * `AnimatedMain` (like /store) so the signature PinnedHero can pin without an
 * `overflow-hidden` ancestor between it and the scroll root. A MobileTopBar
 * carries the hamburger + title on small viewports.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RoadmapSection } from '@/components/roadmap/RoadmapSection';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

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
  const { t } = useTranslation('site');
  return (
    <>
      <AnimatedMain
        className="relative isolate min-h-screen w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('roadmap-title', { defaultValue: 'Roadmap' })} />
        <RoadmapSection />
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library/store layout. */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
