/**
 * Edit Blog Post Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Spinner } from '@/components/ui/spinner';
import { getPostBySlug } from '@/lib/blog';

// Heavy, admin-only editor — code-split it out of the shared bundle.
const MDXEditor = lazy(() => import('@/components/admin/MDXEditor').then((m) => ({ default: m.MDXEditor })));

const fetchPostForEdit = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  // Admin gating lives once, in `/_site/admin/route.tsx` — its `beforeLoad`
  // runs before this loader, so a second session resolution here bought nothing.
  .handler(async ({ data: slug }) => {
    try {
      const post = await getPostBySlug(slug, ["title", "slug", "date", "description", "image", "tags", "content"]);
      return post;
    } catch {
      throw notFound();
    }
  });

export const Route = createFileRoute('/_site/admin/blog/$slug/edit')({
  head: () => ({
    meta: [{ title: 'Edit Blog Post | Admin | RMH Studios' }],
  }),
  loader: ({ params }) => fetchPostForEdit({ data: params.slug }),
  component: EditBlogPostPage,
});

function EditBlogPostPage() {
  const post = Route.useLoaderData();
  return (
    <Suspense
      fallback={
        // A route-level loading state has no reason to escape the shell — and
        // could not anyway: `fixed inset-0 z-50` here is measured inside
        // `.radial-frame`'s stacking context (pinned at 1), so the top bar and
        // the hub orb stayed painted over this "takeover" and it read as a
        // half-blanked page.
        <div className="flex min-h-[60dvh] items-center justify-center">
          <Spinner size={32} />
        </div>
      }
    >
      <MDXEditor initialData={post} isEdit={true} />
    </Suspense>
  );
}
