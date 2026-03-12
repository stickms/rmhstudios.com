/**
 * Admin Blog Dashboard Route
 */

import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { getAllPosts } from '@/lib/blog';
import { ArrowLeft, Plus, Edit } from 'lucide-react';
import { DeleteBlogButton } from '@/components/admin/DeleteBlogButton';

const fetchBlogData = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  const posts = await getAllPosts(["title", "slug", "date"]);
  return { posts };
});

export const Route = createFileRoute('/_site/admin/blog/')({
  head: () => ({
    meta: [{ title: 'Manage Blog Posts | Admin | RMH Studios' }],
  }),
  loader: () => fetchBlogData(),
  component: AdminBlogDashboard,
});

function AdminBlogDashboard() {
  const { posts } = Route.useLoaderData();

  return (
    <PageLayout title="Manage Blog Posts" wide>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-site-text-dim hover:text-site-text transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold font-display text-site-text">Manage Blog Posts</h1>
              <p className="text-site-text-muted mt-1 text-sm">Create, edit, and delete blog posts.</p>
            </div>
          </div>

          <Link to="/admin/blog/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 gap-2 bg-site-accent hover:bg-site-accent-hover text-white self-end sm:self-auto shrink-0">
            <Plus className="w-4 h-4" /> New Post
          </Link>
        </div>

        <div className="bg-site-surface border border-site-border rounded-xl divide-y divide-site-border overflow-hidden">
          {posts.length === 0 ? (
            <div className="p-8 text-center text-site-text-dim">
              No blog posts found. Create one to get started!
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.slug as string} className="flex items-center justify-between gap-2 p-4 hover:bg-site-bg/50 transition-colors">
                <div className="min-w-0">
                  <h3 className="font-bold text-site-text truncate">{post.title as string}</h3>
                  <p className="text-sm text-site-text-dim truncate">{post.date as string} · /{post.slug as string}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link 
                    to={`/admin/blog/${post.slug as string}/edit` as string}
                    className="inline-flex items-center justify-center p-2 rounded-md hover:bg-site-border text-site-text-dim hover:text-site-text transition-colors"
                    title="Edit Post"
                  >
                    <Edit className="w-4 h-4" />
                  </Link>
                  <DeleteBlogButton slug={post.slug as string} title={post.title as string} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PageLayout>
  );
}
