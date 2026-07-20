/**
 * Edit Blog Post Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, redirect, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { Spinner } from '@/components/ui/spinner';
import { getPostBySlug } from '@/lib/blog';

// Heavy, admin-only editor — code-split it out of the shared bundle.
const MDXEditor = lazy(() => import('@/components/admin/MDXEditor').then((m) => ({ default: m.MDXEditor })));

const fetchPostForEdit = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !(session.user as any).isAdmin) {
      throw redirect({ to: '/' });
    }

    try {
      const post = await getPostBySlug(slug, ["title", "slug", "date", "description", "image", "tags", "content"]);
      return post;
    } catch (e) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-bg">
          <Spinner size={32} />
        </div>
      }
    >
      <MDXEditor initialData={post} isEdit={true} />
    </Suspense>
  );
}
