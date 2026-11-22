/**
 * Edit Blog Post Route
 */

import { lazy } from 'react';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Spinner } from '@/components/ui/spinner';
import { getPostBySlug } from '@/lib/blog';
import { requireAdminServerFn } from '@/lib/auth/server-fn-guards.server';
import { ArrivalSuspense } from '@/components/ui/arrive';

// Heavy, admin-only editor — code-split it out of the shared bundle.
const MDXEditor = lazy(() => import('@/components/admin/MDXEditor').then((m) => ({ default: m.MDXEditor })));

const fetchPostForEdit = createServerFn({ method: 'GET' })
  // A hand check rather than zod: this route module is in the shell's static closure, and zod is not.
  .validator((slug: unknown): string => {
    if (typeof slug !== 'string' || slug.length < 1 || slug.length > 200) throw new Error('Invalid slug');
    return slug;
  })
  // A server function is its own HTTP endpoint: `/_site/admin/route.tsx`'s `beforeLoad` does not run before a direct
  // call, and this one now returns drafts (s03-05), so it checks the admin flag itself and answers 404 otherwise.
  .handler(async ({ data: slug }) => {
    try {
      await requireAdminServerFn();
      // `admin`: the editor opens a Log in any state, drafts and scheduled Logs included.
      const post = await getPostBySlug(
        slug,
        ['title', 'slug', 'date', 'description', 'image', 'tags', 'content', 'announcement', 'business', 'announcementExpiresAt', 'status', 'publishAt'],
        { admin: true },
      );
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
    <ArrivalSuspense
      fallback={
        // A route-level loading state has no reason to escape the shell — and
        // could not anyway: `fixed inset-0 z-50` here is measured inside
        // the page frame's stacking context (pinned at 1), so the top bar and
        // the hub orb stayed painted over this "takeover" and it read as a
        // half-blanked page.
        <div className="flex min-h-[60dvh] items-center justify-center">
          <Spinner size={32} />
        </div>
      }
    >
      <MDXEditor initialData={post} isEdit={true} />
    </ArrivalSuspense>
  );
}
