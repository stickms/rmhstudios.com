/**
 * New Blog Post Route
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { MDXEditor } from '@/components/admin/MDXEditor';

const checkAdmin = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getWebRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  return true;
});

export const Route = createFileRoute('/admin/blog/new')({
  head: () => ({
    meta: [{ title: 'Create Blog Post | Admin | RMH Studios' }],
  }),
  beforeLoad: () => checkAdmin(),
  component: NewBlogPostPage,
});

function NewBlogPostPage() {
  return <MDXEditor />;
}
