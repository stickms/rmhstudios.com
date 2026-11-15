import { createFileRoute } from '@tanstack/react-router';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { creatorAnalyticsQuery } from '@/lib/profile/analytics.queries';
import { PageLayout } from '@/components/feed/PageLayout';
import { AnalyticsDashboard } from '@/components/creator-studio/AnalyticsDashboard';
import { useSession } from '@/components/Providers';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_site/analytics')({
  head: () => ({ meta: [{ title: 'Creator Analytics | RMH Studios' }] }),
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, creatorAnalyticsQuery()),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const arrival = useArrival(!isPending);

  return (
    <PageLayout title={t('creator-analytics', { defaultValue: 'Creator analytics' })} wide>
      <div className={cn('min-w-0 px-4 pt-4 pb-[var(--site-page-bottom-space)]', arrival)}>
        {isPending ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !session ? (
          <SignedOutPrompt
            callbackURL="/analytics"
            title={t('sign-in-to-view-analytics', {
              defaultValue: 'Sign in to view your analytics',
            })}
          />
        ) : (
          <AnalyticsDashboard />
        )}
      </div>
    </PageLayout>
  );
}
