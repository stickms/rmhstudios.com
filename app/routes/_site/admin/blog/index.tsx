/**
 * Admin Blog Dashboard Route
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { getAllPosts } from '@/lib/blog';
import { Plus, Edit, FileText } from 'lucide-react';
import { DeleteBlogButton } from '@/components/admin/DeleteBlogButton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from 'react-i18next';

// No admin check here: `/_site/admin/route.tsx` gates the whole subtree in its
// `beforeLoad`, which runs before any child loader. Re-checking cost a second
// session resolution on every navigation into the section and was one more copy
// of the rule to keep in sync with the real one.
const fetchBlogData = createServerFn({ method: 'GET' }).handler(async () => {
  const posts = await getAllPosts(['title', 'slug', 'date']);
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
  const { t } = useTranslation('admin');

  return (
    <PageLayout
      title={t('manage-blog-posts', { defaultValue: 'Manage Blog Posts' })}
      backTo="/admin"
      description={t('manage-blog-posts-description', {
        defaultValue: 'Create, edit, and delete blog posts.',
      })}
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      headerRight={
        <Button asChild>
          <Link to="/admin/blog/new">
            <Plus aria-hidden /> {t('new-post', { defaultValue: 'New Post' })}
          </Link>
        </Button>
      }
      wide
    >
      <AdminBody>
        {posts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('no-blog-posts-found', { defaultValue: 'No blog posts found.' })}
            description={t('no-blog-posts-hint', { defaultValue: 'Create one to get started!' })}
          />
        ) : (
          <div className="divide-y divide-site-border">
            {posts.map((post) => (
              <div
                key={post.slug as string}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <h3 className="t-heading break-words text-site-text">{post.title as string}</h3>
                  <p className="t-meta mt-1 break-all">
                    {post.date as string} · /{post.slug as string}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    asChild
                    variant="ghost"
                    size="icon-sm"
                    title={t('edit-post', { defaultValue: 'Edit Post' })}
                  >
                    <Link
                      to={`/admin/blog/${post.slug as string}/edit` as string}
                      aria-label={t('edit-post', { defaultValue: 'Edit Post' })}
                    >
                      <Edit aria-hidden />
                    </Link>
                  </Button>
                  <DeleteBlogButton slug={post.slug as string} title={post.title as string} />
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminBody>
    </PageLayout>
  );
}
