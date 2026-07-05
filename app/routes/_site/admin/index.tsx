/**
 * Admin Dashboard Route
 */

import { useTranslation } from "react-i18next";
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  return session;
});

export const Route = createFileRoute('/_site/admin/')({
  head: () => ({
    meta: [{ title: 'Admin Dashboard | RMH Studios' }],
  }),
  beforeLoad: () => getAdminSession(),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { t } = useTranslation("admin");
  return (
    <PageLayout title={t("admin-dashboard", { defaultValue: "Admin Dashboard" })} wide backTo="/">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-site-text">{t("admin-dashboard", { defaultValue: "Admin Dashboard" })}</h1>
          <p className="text-site-text-muted mt-1">{t("admin-dashboard-subtitle", { defaultValue: "Manage users, builds, and site content." })}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/admin/users"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("users-title", { defaultValue: "Users" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("users-description", { defaultValue: "Manage user accounts, verify users, edit profiles, and view statistics." })}
            </p>
          </Link>

          <Link
            to="/admin/user-builds"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("user-builds-title", { defaultValue: "All User Builds" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("user-builds-description", { defaultValue: "Moderate and search through all submitted builds from the community. Edit metadata and change visibilities." })}
            </p>
          </Link>

          <Link
            to="/admin/blog"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("blog-title", { defaultValue: "Manage Blog Posts" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("blog-description", { defaultValue: "Write new developer logs, or edit and delete existing blog posts." })}
            </p>
          </Link>

          <Link
            to="/admin/reports"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("moderation-queue-title", { defaultValue: "Moderation Queue" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("moderation-queue-description", { defaultValue: "Review user reports of posts, comments, profiles, and builds. Resolve, dismiss, or take content down." })}
            </p>
          </Link>

          <Link
            to="/admin/library-quota"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("library-quota-title", { defaultValue: "Library Upload Appeals" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("library-quota-description", { defaultValue: "Review users' requests to raise their library upload limit. Approve to grant a higher cap, or deny." })}
            </p>
          </Link>

          <Link
            to="/admin/library-storage"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("library-storage-title", { defaultValue: "Library Storage Health" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("library-storage-description", { defaultValue: "Check whether library uploads use durable object storage, and list any books whose file is missing." })}
            </p>
          </Link>

          <Link
            to="/admin/announcements"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("announcements-title", { defaultValue: "Feed Announcements" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("announcements-description", { defaultValue: "Publish pinned banners shown at the top of everyone's feed. Activate, deactivate, or remove them." })}
            </p>
          </Link>

          <Link
            to="/admin/predictions"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("predictions-title", { defaultValue: "Prediction Markets" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("predictions-description", { defaultValue: "Approve or deny submitted predictions, and resolve open markets to YES or NO to pay out winners." })}
            </p>
          </Link>

          <Link
            to="/admin/analytics"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("analytics-title", { defaultValue: "Analytics" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("analytics-description", { defaultValue: "Platform stats: users, active users, posts, comments, reports, and coins in circulation." })}
            </p>
          </Link>

          <Link
            to="/admin/rideshare"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("rideshare-title", { defaultValue: "Rideshare Applications" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("rideshare-description", { defaultValue: "Review RMH Rideshare driver applications, inspect licenses, and approve or reject drivers." })}
            </p>
          </Link>

          <Link
            to="/admin/albums"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("albums-title", { defaultValue: "Library Albums" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("albums-description", { defaultValue: "Create photo/video albums and bulk-upload media. Images are compressed to WebP and videos transcoded, then stored in object storage." })}
            </p>
          </Link>

          <Link
            to="/admin/audit"
            className="block p-6 rounded-site border border-site-border bg-site-surface hover:border-site-accent/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("audit-log-title", { defaultValue: "Audit Log" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("audit-log-description", { defaultValue: "A record of admin actions — report decisions, bans, strikes, and announcements." })}
            </p>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
