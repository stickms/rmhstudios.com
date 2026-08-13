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
      <MDXEditor />
    </Suspense>
  );
}
