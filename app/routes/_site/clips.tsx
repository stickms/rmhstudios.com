import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ClipsColumn } from '@/components/feed/ClipsColumn';

export const Route = createFileRoute('/_site/clips')({
  head: () => ({ meta: [{ title: 'Clips | RMH Studios' }] }),
  component: ClipsPage,
});

function ClipsPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <ClipsColumn />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
