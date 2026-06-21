import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ExploreColumn } from '@/components/feed/ExploreColumn';

export const Route = createFileRoute('/_site/explore')({
  head: () => ({ meta: [{ title: 'Explore | RMH Studios' }] }),
  component: ExplorePage,
});

function ExplorePage() {
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <ExploreColumn />
    </AnimatedMain>
  );
}
