import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <div className="sticky top-0 z-10 border-b border-site-border glass-chrome px-4 py-3">
          <h1 className="font-(family-name:--site-font-display) text-lg font-bold text-site-text">
            {t('creator-analytics', { defaultValue: 'Creator Analytics' })}
          </h1>
        </div>

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
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
