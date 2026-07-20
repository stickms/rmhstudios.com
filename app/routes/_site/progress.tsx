import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { Zap } from 'lucide-react';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { JourneyColumn } from '@/components/feed/JourneyColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_site/progress')({
  head: () => ({ meta: [{ title: 'Progress | RMH Studios' }] }),
  component: ProgressPage,
});

function ProgressPage() {
  const { t } = useTranslation('site');
  // The gate header reuses ProgressColumn's heading key, which lives in `feed`.
  const { t: tFeed } = useTranslation('feed');
  const { data: session, isPending } = useSession();

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {session && !isPending ? (
          <JourneyColumn userId={session.user.id} initialTab="progress" />
        ) : (
          /* JourneyColumn owns the header once signed in (its tab bar *is* the
             header, deliberately title-less — its tab bar fills the row). The
             gate states have no tab bar to show, so they carry the page's own
             title instead: a bare header would render as an empty bordered strip
             on desktop, where the drawer button is md:hidden. Key/icon match
             ProgressColumn's standalone header. */
          <>
            <ColumnHeader
              icon={Zap}
              title={tFeed('progress-heading', { defaultValue: 'Progress' })}
            />
            {isPending ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
                <p className="font-medium text-site-text">
                  {t('sign-in-to-track-progress', {
                    defaultValue: 'Sign in to track your progress',
                  })}
                </p>
                <Link to="/login" search={{ callbackURL: '/progress' }}>
                  <Button variant="accent">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
                </Link>
              </div>
            )}
          </>
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
