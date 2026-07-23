import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { DocsSidebar, DEFAULT_WIKI_SLUG } from '@/components/developer/wiki';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

/** Wiki layout: a left page nav alongside the rendered doc page. Sits in the
 *  canonical centred shell (AnimatedMain reading column + reserved context rail)
 *  so the developer docs line up with the rest of the site. */
export const Route = createFileRoute('/_site/developer/docs')({
  component: DocsLayout,
});

function DocsLayout() {
  const params = useParams({ strict: false }) as { page?: string };
  const activeSlug = params.page ?? DEFAULT_WIKI_SLUG;
  return (
    <>
      <AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}>
        <div className="flex gap-5 p-4">
          <div className="hidden md:block">
            <DocsSidebar activeSlug={activeSlug} />
          </div>
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </AnimatedMain>
      <ContextRail reserve compactReserve />
    </>
  );
}
