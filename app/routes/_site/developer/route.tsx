import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

/** Shared shell for the developer area (keys dashboard + docs wiki). */
export const Route = createFileRoute('/_site/developer')({
  component: DeveloperLayout,
});

function DeveloperLayout() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
      >
        <Outlet />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
