/**
 * Admin Dashboard Route
 */

import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminRightSidebar } from '@/components/feed/AdminRightSidebar';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  return session;
});

export const Route = createFileRoute('/admin/')({
  head: () => ({
    meta: [{ title: 'Admin Dashboard | RMH Studios' }],
  }),
  beforeLoad: () => getAdminSession(),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  return (
    <PageLayout title="Admin Dashboard" wide rightSidebar={<AdminRightSidebar />}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-site-text">Admin Dashboard</h1>
          <p className="text-site-text-muted mt-1">Manage users, builds, and site content.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/admin/users"
            className="block p-6 rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">Users</h2>
            <p className="text-site-text-muted text-sm mt-2">
              Manage user accounts, verify users, edit profiles, and view statistics.
            </p>
          </Link>

          <Link
            to="/admin/curated-builds"
            className="block p-6 rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">Curated Builds</h2>
            <p className="text-site-text-muted text-sm mt-2">
              Manage official games and apps. Promote community builds, adjust sorting, and edit build details.
            </p>
          </Link>
          <Link
            to="/admin/user-builds"
            className="block p-6 rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">All User Builds</h2>
            <p className="text-site-text-muted text-sm mt-2">
              Moderate and search through all submitted builds from the community. Edit metadata and change visibilities.
            </p>
          </Link>

          <Link
            to="/admin/blog"
            className="block p-6 rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group md:col-span-2"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">Manage Blog Posts</h2>
            <p className="text-site-text-muted text-sm mt-2">
              Write new developer logs, or edit and delete existing blog posts.
            </p>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
