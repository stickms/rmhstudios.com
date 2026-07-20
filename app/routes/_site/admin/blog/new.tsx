/**
 * New Blog Post Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { Spinner } from '@/components/ui/spinner';

// The MDX editor bundles a markdown editor, live preview, and react-markdown —
// heavy and admin-only, so code-split it out of the shared bundle.
const MDXEditor = lazy(() => import('@/components/admin/MDXEditor').then((m) => ({ default: m.MDXEditor })));

const checkAdmin = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  return true;
});

export const Route = createFileRoute('/_site/admin/blog/new')({
  head: () => ({
    meta: [{ title: 'Create Blog Post | Admin | RMH Studios' }],
  }),
  beforeLoad: () => checkAdmin(),
  component: NewBlogPostPage,
});

function NewBlogPostPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-bg">
          <Spinner size={32} />
        </div>
      }
    >
      <MDXEditor />
    </Suspense>
  );
}
