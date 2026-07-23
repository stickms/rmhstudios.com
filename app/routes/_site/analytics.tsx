import { createFileRoute, Link } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { AnalyticsDashboard } from '@/components/creator-studio/AnalyticsDashboard';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_site/analytics')({
  head: () => ({ meta: [{ title: 'Creator Analytics | RMH Studios' }] }),
  component: AnalyticsPage,
});

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
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <p className="font-medium text-site-text">
              {t('sign-in-to-view-analytics', { defaultValue: 'Sign in to view your analytics' })}
            </p>
            <Link to="/login" search={{ callbackURL: '/analytics' }}>
              <Button variant="accent">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
            </Link>
          </div>
        ) : (
          <AnalyticsDashboard />
        )}
      </div>
    </PageLayout>
  );
}
