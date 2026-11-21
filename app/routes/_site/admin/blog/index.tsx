/**
 * Admin Blog Dashboard Route
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { requireAdminServerFn } from '@/lib/auth/server-fn-guards.server';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { listLogsForAdmin } from '@/lib/blog/publication.server';
import { filterLogs, formatUtcMinute, type LogFilter, type LogStatus } from '@/lib/blog/publication';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useState } from 'react';
import { getBusiness } from '@/lib/businesses';
import { Plus, Edit, FileText } from 'lucide-react';
import { DeleteBlogButton } from '@/components/admin/DeleteBlogButton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from 'react-i18next';

// A server function is its own HTTP endpoint, so `/_site/admin/route.tsx`'s `beforeLoad` does not cover a direct
// call. This list shows drafts and scheduled Logs (s03-05), so it checks the admin flag itself.
const fetchBlogData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdminServerFn();
  // Every Log in every state: this is the one list that shows drafts and scheduled Logs.
  const posts = await listLogsForAdmin();
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
  const { posts: allPosts } = Route.useLoaderData();
  const { t } = useTranslation('admin');
  const { t: ts } = useTranslation('log-drafts');
  const [filter, setFilter] = useState<LogFilter>('all');
  const posts = filterLogs(allPosts, filter);
  const count = (status: LogStatus) => allPosts.filter((p) => p.status === status).length;
  const tabs: TabItem[] = [
    { id: 'all', label: ts('filter-all', { defaultValue: 'All' }), count: allPosts.length },
    { id: 'draft', label: ts('filter-drafts', { defaultValue: 'Drafts' }), count: count('draft') },
    { id: 'scheduled', label: ts('filter-scheduled', { defaultValue: 'Scheduled' }), count: count('scheduled') },
    { id: 'published', label: ts('filter-published', { defaultValue: 'Published' }), count: count('published') },
  ];
  const statusLabel: Record<LogStatus, string> = {
    draft: ts('status-draft', { defaultValue: 'Draft' }),
    scheduled: ts('status-scheduled', { defaultValue: 'Scheduled' }),
    published: ts('status-published', { defaultValue: 'Published' }),
  };

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
        <Tabs
          tabs={tabs}
          value={filter}
          onChange={(id) => setFilter(id as LogFilter)}
          idBase="admin-logs"
          aria-label={ts('filter-label', { defaultValue: 'Filter Logs by status' })}
        />
        <div role="tabpanel" id={`admin-logs-panel-${filter}`} aria-labelledby={`admin-logs-tab-${filter}`}>
        {posts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={
              allPosts.length === 0
                ? t('no-blog-posts-found', { defaultValue: 'No blog posts found.' })
                : ts('filter-empty', { defaultValue: 'No Logs with this status.' })
            }
            description={
              allPosts.length === 0
                ? t('no-blog-posts-hint', { defaultValue: 'Create one to get started!' })
                : undefined
            }
          />
        ) : (
          <div className="divide-y divide-site-border">
            {posts.map((post) => (
              <div
                key={post.slug}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <h3 className="t-heading break-words text-site-text">{post.title}</h3>
                  <p className="t-meta mt-1 break-all">
                    {post.announcement ? (
                      <>
                        {getBusiness(post.business).name} ·{' '}
                        {t('blog-announcement-label', { defaultValue: 'Announcement' })} ·{' '}
                      </>
                    ) : null}
                    {statusLabel[post.status]}
                    {post.status === 'scheduled' && post.publishAt
                      ? ` ${ts('status-scheduled-for', { defaultValue: 'for {{time}} UTC', time: formatUtcMinute(post.publishAt) })}`
                      : ''}
                    {' · '}
                    {post.date} · /{post.slug}
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
                      to={`/admin/blog/${post.slug}/edit` as string}
                      aria-label={t('edit-post', { defaultValue: 'Edit Post' })}
                    >
                      <Edit aria-hidden />
                    </Link>
                  </Button>
                  <DeleteBlogButton slug={post.slug} title={post.title} />
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </AdminBody>
    </PageLayout>
  );
}
