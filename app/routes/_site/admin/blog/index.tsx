/**
 * Admin Blog Dashboard Route
 */

import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { getAllPosts } from '@/lib/blog';
import { Plus, Edit, FileText } from 'lucide-react';
import { DeleteBlogButton } from '@/components/admin/DeleteBlogButton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation("admin");

  return (
    <PageLayout
      title={t("manage-blog-posts", { defaultValue: "Manage Blog Posts" })}
      backTo="/admin"
      backLabel={t("back-to-admin", { defaultValue: "Back to admin" })}
      wide
    >
      <div className="mx-auto w-full max-w-4xl p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-site-text-muted text-sm">{t("manage-blog-posts-description", { defaultValue: "Create, edit, and delete blog posts." })}</p>

          <Button asChild className="self-end sm:self-auto shrink-0">
            <Link to="/admin/blog/new">
              <Plus className="w-4 h-4" /> {t("new-post", { defaultValue: "New Post" })}
            </Link>
          </Button>
        </div>

        {posts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("no-blog-posts-found", { defaultValue: "No blog posts found." })}
            description={t("no-blog-posts-hint", { defaultValue: "Create one to get started!" })}
          />
        ) : (
          <div className="glass-fill rounded-site divide-y divide-site-border overflow-hidden">
            {posts.map((post) => (
              <div key={post.slug as string} className="flex items-center justify-between gap-2 p-4 transition-colors hover:bg-site-surface-hover">
                <div className="min-w-0">
                  <h3 className="font-bold text-site-text truncate">{post.title as string}</h3>
                  <p className="text-sm text-site-text-dim truncate">{post.date as string} · /{post.slug as string}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="ghost" size="icon-sm" title={t("edit-post", { defaultValue: "Edit Post" })}>
                    <Link to={`/admin/blog/${post.slug as string}/edit` as string} aria-label={t("edit-post", { defaultValue: "Edit Post" })}>
                      <Edit className="w-4 h-4" />
                    </Link>
                  </Button>
                  <DeleteBlogButton slug={post.slug as string} title={post.title as string} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
