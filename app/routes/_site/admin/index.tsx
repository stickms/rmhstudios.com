/**
 * Admin Dashboard Route
 */

import { useTranslation } from "react-i18next";
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useAdminReviewCount } from '@/lib/useAdminReviewCount';

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
  // The ranked-pool card's strings live with the rest of Slice It's catalogue
  // rather than in `admin`, so the game's vocabulary ("ranked pool", "chart")
  // is translated once, in the namespace that already defines it.
  const { t: tSlice } = useTranslation("r-slice-it");
  // The dashboard is admin-gated (beforeLoad), so the viewer is always an admin.
  const { counts } = useAdminReviewCount(true);
  return (
    <PageLayout title={t("admin-dashboard", { defaultValue: "Admin Dashboard" })} wide backTo="/">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <p className="text-site-text-muted">{t("admin-dashboard-subtitle", { defaultValue: "Manage users, builds, and site content." })}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/admin/users"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("users-title", { defaultValue: "Users" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("users-description", { defaultValue: "Manage user accounts, verify users, edit profiles, and view statistics." })}
            </p>
          </Link>

          <Link
            to="/admin/user-builds"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("user-builds-title", { defaultValue: "All User Builds" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("user-builds-description", { defaultValue: "Moderate and search through all submitted builds from the community. Edit metadata and change visibilities." })}
            </p>
          </Link>

          <Link
            to="/admin/blog"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("blog-title", { defaultValue: "Manage Blog Posts" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("blog-description", { defaultValue: "Write new developer logs, or edit and delete existing blog posts." })}
            </p>
          </Link>

          <Link
            to="/admin/reports"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="flex items-center gap-2 text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
              {t("moderation-queue-title", { defaultValue: "Moderation Queue" })}
              {counts.reports > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-site-danger px-1.5 py-0.5 text-xs font-bold text-site-danger-fg">
                  {counts.reports}
                </span>
              )}
            </h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("moderation-queue-description", { defaultValue: "Review user reports of posts, comments, profiles, and builds. Resolve, dismiss, or take content down." })}
            </p>
          </Link>

          <Link
            to="/admin/economy"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("economy-title", { defaultValue: "Coin Economy" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("economy-card-description", { defaultValue: "Coins created versus destroyed, total float, and holder concentration. Watch the sink ratio for inflation." })}
            </p>
          </Link>

          <Link
            to="/admin/appeals"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="flex items-center gap-2 text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
              {t("appeals-title", { defaultValue: "Strike Appeals" })}
              {counts.appeals > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-site-danger px-1.5 py-0.5 text-xs font-bold text-site-danger-fg">
                  {counts.appeals}
                </span>
              )}
            </h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("appeals-description", { defaultValue: "Users contesting a strike. Overturn to void the strike and lift any ban it triggered, or uphold it with a note." })}
            </p>
          </Link>

          <Link
            to="/admin/security-reports"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("security-reports-title", { defaultValue: "Security Reports" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("security-reports-description", { defaultValue: "Triage and resolve bug-bounty submissions from the /security page." })}
            </p>
          </Link>

          <Link
            to="/admin/library-quota"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("library-quota-title", { defaultValue: "Library Upload Appeals" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("library-quota-description", { defaultValue: "Review users' requests to raise their library upload limit. Approve to grant a higher cap, or deny." })}
            </p>
          </Link>

          <Link
            to="/admin/library-storage"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("library-storage-title", { defaultValue: "Library Storage Health" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("library-storage-description", { defaultValue: "Check whether library uploads use durable object storage, and list any books whose file is missing." })}
            </p>
          </Link>

          <Link
            to="/admin/announcements"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("announcements-title", { defaultValue: "Feed Announcements" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("announcements-description", { defaultValue: "Publish pinned banners shown at the top of everyone's feed. Activate, deactivate, or remove them." })}
            </p>
          </Link>

          <Link
            to="/admin/predictions"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("predictions-title", { defaultValue: "Prediction Markets" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("predictions-description", { defaultValue: "Approve or deny submitted predictions, and resolve open markets to YES or NO to pay out winners." })}
            </p>
          </Link>

          <Link
            to="/admin/analytics"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("analytics-title", { defaultValue: "Analytics" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("analytics-description", { defaultValue: "Platform stats: users, active users, posts, comments, reports, and coins in circulation." })}
            </p>
          </Link>

          <Link
            to="/admin/rideshare"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("rideshare-title", { defaultValue: "Rideshare Applications" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("rideshare-description", { defaultValue: "Review RMH Rideshare driver applications, inspect licenses, and approve or reject drivers." })}
            </p>
          </Link>

          <Link
            to="/admin/albums"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{t("albums-title", { defaultValue: "Library Albums" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {t("albums-description", { defaultValue: "Create photo/video albums and bulk-upload media. Images are compressed to WebP and videos transcoded, then stored in object storage." })}
            </p>
          </Link>

          <Link
            to="/admin/slice-it"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
          >
            <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">{tSlice("admin-rank-card-title", { defaultValue: "Slice It Ranked Pool" })}</h2>
            <p className="text-site-text-muted text-sm mt-2">
              {tSlice("admin-rank-card-description", { defaultValue: "Review charts that passed the automatic qualification gate and promote them into the ranked pool, or take one back out. Only ranked charts feed players' skill ratings." })}
            </p>
          </Link>

          <Link
            to="/admin/audit"
            className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
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
