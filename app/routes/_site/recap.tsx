import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { RecapColumn } from '@/components/feed/RecapColumn';

export const Route = createFileRoute('/_site/recap')({
  head: () => ({ meta: [{ title: 'Your Week | RMH Studios' }] }),
  component: RecapPage,
});

function RecapPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
      <RecapColumn />
    </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
