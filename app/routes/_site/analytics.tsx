import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { AnalyticsDashboard } from '@/components/creator-studio/AnalyticsDashboard';
import { useSession } from '@/components/Providers';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

export const Route = createFileRoute('/_site/analytics')({
  head: () => ({ meta: [{ title: 'Creator Analytics | RMH Studios' }] }),
  component: AnalyticsPage });

function AnalyticsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();

  return (
    <PageLayout title={t('creator-analytics', { defaultValue: 'Creator Analytics' })} wide>
      <div className="min-w-0 px-4 pb-[var(--site-page-bottom-space)]">
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <SignedOutPrompt
            callbackURL="/analytics"
            title={t('sign-in-to-view-analytics', { defaultValue: 'Sign in to view your analytics' })}
          />
        ) : (
          <AnalyticsDashboard />
        )}
      </div>
    </PageLayout>
  );
}
