/**
 * Edit Blog Post Route
 */

import { createFileRoute, redirect, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { MDXEditor } from '@/components/admin/MDXEditor';
import { getPostBySlug } from '@/lib/blog';

const fetchPostForEdit = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
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
  return <MDXEditor initialData={post} isEdit={true} />;
}
