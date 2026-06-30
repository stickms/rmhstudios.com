import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { DocsSidebar, DEFAULT_WIKI_SLUG } from '@/components/developer/wiki';

/** Wiki layout: a left page nav alongside the rendered doc page. */
export const Route = createFileRoute('/_site/developer/docs')({
  component: DocsLayout,
});

function DocsLayout() {
  const params = useParams({ strict: false }) as { page?: string };
  const activeSlug = params.page ?? DEFAULT_WIKI_SLUG;
  return (
    <div className="min-h-screen">
      <div className="flex gap-5 p-4">
        <div className="hidden md:block"><DocsSidebar activeSlug={activeSlug} /></div>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
