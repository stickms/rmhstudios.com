/**
 * New Blog Post Route
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Spinner } from '@/components/ui/spinner';

// The MDX editor bundles a markdown editor, live preview, and react-markdown —
// heavy and admin-only, so code-split it out of the shared bundle.
const MDXEditor = lazy(() => import('@/components/admin/MDXEditor').then((m) => ({ default: m.MDXEditor })));

// Admin gating lives once, in `/_site/admin/route.tsx`.
export const Route = createFileRoute('/_site/admin/blog/new')({
  head: () => ({
    meta: [{ title: 'Create Blog Post | Admin | RMH Studios' }],
  }),
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
