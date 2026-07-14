import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

/** Shared shell for the developer area (keys dashboard + docs wiki). */
export const Route = createFileRoute('/_site/developer')({
  component: DeveloperLayout,
});

function DeveloperLayout() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-[calc(env(safe-area-inset-bottom,0px)+92px)] md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <Outlet />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
