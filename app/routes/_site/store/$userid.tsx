import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { StorefrontColumn } from '@/components/feed/StorefrontColumn';

export const Route = createFileRoute('/_site/store/$userid')({
  head: () => ({ meta: [{ title: 'Store | RMH Studios' }] }),
  component: StorePage,
});

function StorePage() {
  const { userid } = Route.useParams();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <StorefrontColumn userid={userid} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
