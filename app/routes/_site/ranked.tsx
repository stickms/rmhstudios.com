import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { RankedColumn } from '@/components/feed/RankedColumn';

export const Route = createFileRoute('/_site/ranked')({
  head: () => ({ meta: [{ title: 'Ranked | RMH Studios' }] }),
  component: RankedPage,
});

function RankedPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <RankedColumn />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
