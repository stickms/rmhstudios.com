/**
 * Admin Dashboard Route
 */

import { AdminReleaseNotesLink } from '@/components/devplatform/AdminReleaseNotesLink';
import { AdminSafetyLink } from '@/components/safety/AdminSafetyLink';
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { AdminBody } from '@/components/admin/AdminBody';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/feed/PageLayout';
import { useAdminReviewCount } from '@/lib/useAdminReviewCount';
import { AdminQotdLink } from '@/components/posts-plus/AdminQotdLink';
import { AdminDelightLink } from '@/components/delight/AdminDelightLink';
import { AdminCanvasLink } from '@/components/canvas/admin/AdminCanvasLink';
import { AdminChallengeLink } from '@/components/admin/studio-challenges/AdminChallengeLink';
import { AdminReadingLink } from '@/components/reading/admin/AdminReadingLink';
import { InsightsLink } from '@/components/admin/InsightsLink';
import { PerformanceLink } from '@/components/admin/PerformanceLink';
import { DeepseekLink } from '@/components/admin/DeepseekLink';
import { OncallLink } from '@/components/admin/OncallLink';

export const Route = createFileRoute('/_site/admin/')({
  head: () => ({
    meta: [{ title: 'Admin Dashboard | RMH Studios' }],
  }),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { t } = useTranslation('admin');
  // The ranked-pool card's strings live with the rest of Slice It's catalogue
  // rather than in `admin`, so the game's vocabulary ("ranked pool", "chart")
  // is translated once, in the namespace that already defines it.
  const { t: tSlice } = useTranslation('r-slice-it');
  // The dashboard is admin-gated (beforeLoad), so the viewer is always an admin.
  const { counts } = useAdminReviewCount(true);
  return (
    <PageLayout
      title={t('admin-dashboard', { defaultValue: 'Admin Dashboard' })}
      description={t('admin-dashboard-subtitle', {
        defaultValue: 'Manage users, builds, and site content.',
      })}
      wide
      backTo="/"
    >
      <AdminBody>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AdminHubCard
            to="/admin/users"
            title={t('users-title', { defaultValue: 'Users' })}
            description={t('users-description', {
              defaultValue:
                'Manage user accounts, verify users, edit profiles, and view statistics.',
            })}
          />

          <AdminHubCard
            to="/admin/user-builds"
            title={t('user-builds-title', { defaultValue: 'All User Builds' })}
            description={t('user-builds-description-index', {
              defaultValue:
                'Moderate and search through all submitted builds from the community. Edit metadata and change visibilities.',
            })}
          />

          <AdminHubCard
            to="/admin/blog"
            title={t('blog-title', { defaultValue: 'Manage Blog Posts' })}
            description={t('blog-description', {
              defaultValue: 'Write new developer logs, or edit and delete existing blog posts.',
            })}
          />

          <AdminHubCard
            to="/admin/reports"
            title={t('moderation-queue-title', { defaultValue: 'Moderation Queue' })}
            description={t('moderation-queue-description-index', {
              defaultValue:
                'Review user reports of posts, comments, profiles, and builds. Resolve, dismiss, or take content down.',
            })}
            badge={
              counts.reports > 0 ? (
                <Badge variant="danger" size="sm" icon={false}>
                  {counts.reports}
                </Badge>
              ) : undefined
            }
          />

          <AdminHubCard
            to="/admin/economy"
            title={t('economy-title', { defaultValue: 'Coin Economy' })}
            description={t('economy-card-description', {
              defaultValue:
                'Coins created versus destroyed, total float, and holder concentration. Watch the sink ratio for inflation.',
            })}
          />

          <AdminHubCard
            to="/admin/appeals"
            title={t('appeals-title', { defaultValue: 'Strike Appeals' })}
            description={t('appeals-description', {
              defaultValue:
                'Users contesting a strike. Overturn to void the strike and lift any ban it triggered, or uphold it with a note.',
            })}
            badge={
              counts.appeals > 0 ? (
                <Badge variant="danger" size="sm" icon={false}>
                  {counts.appeals}
                </Badge>
              ) : undefined
            }
          />

          <AdminHubCard
            to="/admin/security-reports"
            title={t('security-reports-title', { defaultValue: 'Security Reports' })}
            description={t('security-reports-description', {
              defaultValue: 'Triage and resolve bug-bounty submissions from the /security page.',
            })}
          />

          <AdminHubCard
            to="/admin/library-quota"
            title={t('library-quota-title', { defaultValue: 'Library Upload Appeals' })}
            description={t('library-quota-description', {
              defaultValue:
                "Review users' requests to raise their library upload limit. Approve to grant a higher cap, or deny.",
            })}
          />

          <AdminHubCard
            to="/admin/library-storage"
            title={t('library-storage-title', { defaultValue: 'Library Storage Health' })}
            description={t('library-storage-description', {
              defaultValue:
                'Check whether library uploads use durable object storage, and list any books whose file is missing.',
            })}
          />

          <AdminHubCard
            to="/admin/announcements"
            title={t('announcements-title', { defaultValue: 'Feed Announcements' })}
            description={t('announcements-description', {
              defaultValue:
                "Publish pinned banners shown at the top of everyone's feed. Activate, deactivate, or remove them.",
            })}
          />

          <AdminReleaseNotesLink />

          <AdminHubCard
            to="/admin/predictions"
            title={t('predictions-title', { defaultValue: 'Prediction Markets' })}
            description={t('predictions-description', {
              defaultValue:
                'Approve or deny submitted predictions, and resolve open markets to YES or NO to pay out winners.',
            })}
          />

          <InsightsLink />

          <PerformanceLink />

          <DeepseekLink />

          <OncallLink />

          <AdminHubCard
            to="/admin/bots"
            title={t('bots-title', { defaultValue: 'AI Bots' })}
            description={t('bots-description', {
              defaultValue:
                'Set the bot pool size, how fast new bots are minted, and how often they post. Shows live bot and post counts.',
            })}
          />

          <AdminHubCard
            to="/admin/analytics"
            title={t('analytics-title', { defaultValue: 'Analytics' })}
            description={t('analytics-description', {
              defaultValue:
                'Platform stats: users, active users, posts, comments, reports, and coins in circulation.',
            })}
          />

          <AdminHubCard
            to="/admin/rideshare"
            title={t('rideshare-title', { defaultValue: 'Rideshare Applications' })}
            description={t('rideshare-description', {
              defaultValue:
                'Review RMH Rideshare driver applications, inspect licenses, and approve or reject drivers.',
            })}
          />

          <AdminHubCard
            to="/admin/albums"
            title={t('albums-title', { defaultValue: 'Library Albums' })}
            description={t('albums-description', {
              defaultValue:
                'Create photo/video albums and bulk-upload media. Images are compressed to WebP and videos transcoded, then stored in object storage.',
            })}
          />

          <AdminHubCard
            to="/admin/slice-it"
            title={tSlice('admin-rank-card-title', { defaultValue: 'Slice It Ranked Pool' })}
            description={tSlice('admin-rank-card-description', {
              defaultValue:
                "Review charts that passed the automatic qualification gate and promote them into the ranked pool, or take one back out. Only ranked charts feed players' skill ratings.",
            })}
          />

          <AdminHubCard
            to="/admin/slice-it-content"
            title={tSlice('admin-content-card-title', {
              defaultValue: 'Slice It Content & Storage',
            })}
            description={tSlice('admin-content-card-description', {
              defaultValue:
                'Quota headroom, upload rate, charts whose telemetry says they generated badly, and storage objects no song points at.',
            })}
          />

          <AdminHubCard
            to="/admin/audit"
            title={t('audit-log-title', { defaultValue: 'Audit Log' })}
            description={t('audit-log-description', {
              defaultValue:
                'A record of admin actions — report decisions, bans, strikes, and announcements.',
            })}
          />

          <AdminSafetyLink />
          <AdminQotdLink />
          <AdminDelightLink />
          <AdminCanvasLink />
          <AdminChallengeLink />
          <AdminReadingLink />
        </div>
      </AdminBody>
    </PageLayout>
  );
}
