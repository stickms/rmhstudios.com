/**
 * Admin Dashboard Route
 */

import { AdminReleaseNotesLink } from '@/components/devplatform/AdminReleaseNotesLink';
import { AdminSafetyLink } from '@/components/safety/AdminSafetyLink';
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { AdminFeedbackCard } from '@/components/feedback/AdminFeedbackCard';
import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { LookupField } from '@/components/admin/LookupField';
import { AdminBody } from '@/components/admin/AdminBody';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/feed/PageLayout';
import { useAdminReviewCount } from '@/hooks/useAdminReviewCount';
import { AdminQotdLink } from '@/components/posts-plus/AdminQotdLink';
import { AdminDelightLink } from '@/components/delight/AdminDelightLink';
import { AdminCanvasLink } from '@/components/canvas/admin/AdminCanvasLink';
import { AdminChallengeLink } from '@/components/admin/studio-challenges/AdminChallengeLink';
import { AdminReadingLink } from '@/components/reading/admin/AdminReadingLink';
import { InsightsLink } from '@/components/admin/InsightsLink';
import { PerformanceLink } from '@/components/admin/PerformanceLink';
import { DeepseekLink } from '@/components/admin/DeepseekLink';
import { OncallLink } from '@/components/admin/OncallLink';
import { AdminMedSchoolsLink } from '@/components/admin/medschools/AdminMedSchoolsLink';

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
        <LookupField />
        <div className="grid grid-cols-1 border-t border-site-border md:grid-cols-2 md:gap-x-8">
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
                <Badge variant="danger" icon={false}>
                  {counts.reports}
                </Badge>
              ) : undefined
            }
          />

          <AdminHubCard
            to="/admin/email"
            title={t('email-title', { defaultValue: 'Email' })}
            description={t('email-card-description', {
              defaultValue:
                'Email everyone, a filtered group or people you choose. Preview who it reaches, send yourself a test, and follow the send.',
            })}
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
            to="/admin/census"
            title={t('census-title', { defaultValue: 'Census' })}
            description={t('census-card-description', {
              defaultValue:
                'Every table with its rows and signs of writes, and every game and app with its 30-day actives. Live, plus one stored snapshot a month.',
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
                <Badge variant="danger" icon={false}>
                  {counts.appeals}
                </Badge>
              ) : undefined
            }
          />

          <AdminHubCard
            to="/admin/emoji-packs"
            title={t('emoji-packs-review-title', { defaultValue: 'Emoji Pack Review' })}
            description={t('emoji-packs-review-description', {
              defaultValue:
                'Approve or remove new and edited emoji and sticker packs before other people can install them.',
            })}
            badge={
              counts.emojiPacks > 0 ? (
                <Badge variant="danger" icon={false}>
                  {counts.emojiPacks}
                </Badge>
              ) : undefined
            }
          />

          <AdminHubCard
            to="/admin/market"
            title={t('market-review-title', { defaultValue: 'Marketplace Review' })}
            description={t('market-review-card-description', {
              defaultValue:
                'Listings held after a buy far above the usual price. Release them back to sale, or cancel and return the item.',
            })}
            badge={
              counts.market > 0 ? (
                <Badge variant="danger" icon={false}>
                  {counts.market}
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
            to="/admin/blog"
            title={t('announcements-sitewide-title', { defaultValue: 'Announcements' })}
            description={t('announcements-sitewide-description', {
              defaultValue:
                'Announce a blog post sitewide: it pops up once for every visitor and is pinned at the top of the feed.',
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

          <AdminHubCard
            to="/admin/flags"
            title={t('flags-card-title', { defaultValue: 'Feature flags' })}
            description={t('flags-card-description', {
              defaultValue: 'Turn features on for a percentage of users without a deploy.',
            })}
          />

          <AdminSafetyLink />
          <AdminQotdLink />
          <AdminDelightLink />
          <AdminCanvasLink />
          <AdminChallengeLink />
          <AdminReadingLink />
          <AdminMedSchoolsLink />
          {/* Sprint 05 admin tools (docs/autonomous/sprint-05/plan.md §Anchors) */}
          {/* s05-02 admin-jobs */}
          <AdminHubCard
            to="/admin/jobs"
            title={t('card-title', { ns: 'admin-jobs', defaultValue: 'Background jobs' })}
            description={t('card-description', {
              ns: 'admin-jobs',
              defaultValue: 'Queue health, failed jobs and their errors, with retry and cancel.',
            })}
          />

          {/* s05-03 admin-outbox */}
          <AdminHubCard
            to="/admin/outbox"
            title={t('card-title', { ns: 'admin-outbox', defaultValue: 'Outbox' })}
            description={t('card-description', {
              ns: 'admin-outbox',
              defaultValue: 'Events that gave up delivering: read the error, requeue or discard.',
            })}
          />

          {/* s05-10 admin-lookup */}
          <AdminHubCard
            to="/admin/lookup"
            title={t('card-title', { ns: 'admin-lookup', defaultValue: 'Lookup' })}
            description={t('card-description', {
              ns: 'admin-lookup',
              defaultValue: 'Paste an id, handle, e-mail address or link to find what it is.',
            })}
          />

          {/* Sprint 06 admin tools */}
          {/* s06-05 feedback-inbox */}
          <AdminFeedbackCard />

          {/* Sprint 07 admin tools */}
          {/* s07-13 admin-batch-lookup */}

          {/* Sprint 08 admin tools */}
          {/* s08-08 admin-api-oversight */}
          <AdminHubCard
            to="/admin/api-keys"
            title={t('card-title', { ns: 'admin-api-oversight', defaultValue: 'API keys' })}
            description={t('card-description', {
              ns: 'admin-api-oversight',
              defaultValue: 'Developer keys ranked by use, with error rates. Suspend a key or cap its rate.',
            })}
          />

          {/* s08-18 admin-spam-sweep */}
          <AdminHubCard
            to="/admin/sweeps"
            title={t('card-title', { ns: 'admin-spam-sweep', defaultValue: 'Spam sweeps' })}
            description={t('card-description', {
              ns: 'admin-spam-sweep',
              defaultValue: 'Remove a spam account\'s recent posts and replies in one step, and undo it.',
            })}
          />

          {/* Sprint 09 admin tools */}
          {/* s09-12 media-sweep */}
          <AdminHubCard
            to="/admin/media-sweep"
            title={t('card-title', { ns: 'media-sweep', defaultValue: 'Media sweep' })}
            description={t('card-description', {
              ns: 'media-sweep',
              defaultValue: 'Uploads nobody uses, removed from storage. Preview what a run would delete, then run it.',
            })}
          />

          {/* Sprint 10 admin tools */}
          {/* s10-16 speedrun-queue */}
          <AdminHubCard
            to="/admin/speedruns"
            title={t('card-title', { ns: 'speedrun-queue', defaultValue: 'Speedrun review' })}
            description={t('card-description', {
              ns: 'speedrun-queue',
              defaultValue: 'Runs waiting for a human verdict, with the replay one click away. Verify, reject or reopen.',
            })}
          />

          {/* s10-15 admin-webhooks */}
          <AdminHubCard
            to="/admin/webhooks"
            title={t('card-title', { ns: 'admin-webhooks', defaultValue: 'Webhooks' })}
            description={t('card-description', {
              ns: 'admin-webhooks',
              defaultValue: 'Endpoints that are failing or off, with 24-hour delivery figures. Turn one off with a reason its owner reads.',
            })}
          />

          {/* s10-17 admin-communities */}
          <AdminHubCard
            to="/admin/communities"
            title={t('card-title', { ns: 'admin-communities', defaultValue: 'Communities' })}
            description={t('card-description', {
              ns: 'admin-communities',
              defaultValue:
                'Open reports, quiet moderators and fast growth for every community. Take one out of discovery with a reason its moderators read.',
            })}
          />
        </div>
      </AdminBody>
    </PageLayout>
  );
}
