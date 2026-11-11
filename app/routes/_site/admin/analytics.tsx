import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Flag, Coins, BarChart3 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminBody } from '@/components/admin/AdminBody';
import { StatTile } from '@/components/admin/StatTile';
import { useTranslation } from 'react-i18next';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { adminAnalyticsQuery } from '@/lib/admin/admin-ops.queries';

export const Route = createFileRoute('/_site/admin/analytics')({
  head: () => ({ meta: [{ title: 'Analytics | RMH Studios' }] }),
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, adminAnalyticsQuery()),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t } = useTranslation('admin');
  const { data = null, isPending: loading } = useQuery(adminAnalyticsQuery());

  const maxCount = data ? Math.max(1, ...data.postsPerDay.map((d) => d.count)) : 1;

  return (
    <PageLayout title={t('analytics', { defaultValue: 'Analytics' })} wide backTo="/admin">
      <AdminBody>
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !data ? (
          <EmptyState
            icon={BarChart3}
            title={t('analytics-load-error', { defaultValue: 'Could not load analytics.' })}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                icon={Users}
                label={t('stat-users', { defaultValue: 'Users' })}
                value={data.users.total}
                hint={t('stat-new-this-week', {
                  count: data.users.new7,
                  defaultValue: '+{{count}} this week',
                })}
              />
              <StatTile
                icon={Users}
                label={t('stat-active-7d', { defaultValue: 'Active (7d)' })}
                value={data.users.active7}
                hint={t('stat-posted-recently', { defaultValue: 'posted recently' })}
              />
              <StatTile
                icon={FileText}
                label={t('stat-posts', { defaultValue: 'Posts' })}
                value={data.content.posts}
                hint={t('stat-new-this-week', {
                  count: data.content.posts7,
                  defaultValue: '+{{count}} this week',
                })}
              />
              <StatTile
                icon={FileText}
                label={t('stat-comments', { defaultValue: 'Comments' })}
                value={data.content.comments}
              />
              <StatTile
                icon={FileText}
                label={t('stat-builds', { defaultValue: 'Builds' })}
                value={data.content.builds}
              />
              <StatTile
                icon={Users}
                label={t('stat-new-30d', { defaultValue: 'New (30d)' })}
                value={data.users.new30}
              />
              <StatTile
                icon={Flag}
                label={t('stat-open-reports', { defaultValue: 'Open reports' })}
                value={data.moderation.pendingReports}
              />
              <StatTile
                icon={Coins}
                label={t('stat-coins-in-circulation', { defaultValue: 'Coins in circulation' })}
                value={data.economy.coinsInCirculation}
              />
            </div>

            <div className="glass-pane rounded-site p-5">
              <h2 className="site-section-label mb-3">
                {t('posts-per-day-14d', { defaultValue: 'Posts per day (14 days)' })}
              </h2>
              <div className="flex h-40 items-end gap-1">
                {data.postsPerDay.map((d) => (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${d.day}: ${d.count}`}
                  >
                    <div
                      className="w-full rounded-t-site-sm bg-site-accent"
                      style={{
                        height: `${(d.count / maxCount) * 100}%`,
                        minHeight: d.count > 0 ? 2 : 0,
                      }}
                    />
                    <span className="text-micro text-site-text-dim">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </AdminBody>
    </PageLayout>
  );
}
