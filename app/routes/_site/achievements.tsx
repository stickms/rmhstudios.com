import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { Trophy } from 'lucide-react';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { JourneyColumn } from '@/components/feed/JourneyColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { listAchievements } from '@/lib/achievements.server';

// Prefetch the viewer's own achievements server-side so the grid is present at
// first paint / prefetched on intent instead of fetched on mount. Signed-out
// visitors get `null` (the page shows the sign-in prompt instead).
const fetchAchievements = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { achievements: null };
  return { achievements: await listAchievements(session.user.id) };
});

export const Route = createFileRoute('/_site/achievements')({
  head: () => ({ meta: [{ title: 'Achievements | RMH Studios' }] }),
  loader: () => fetchAchievements(),
  component: AchievementsPage,
});

function AchievementsPage() {
  const { t } = useTranslation('site');
  // The gate header reuses AchievementsColumn's heading key, which lives in `feed`.
  const { t: tFeed } = useTranslation('feed');
  const { achievements } = Route.useLoaderData();
  const { data: session, isPending } = useSession();

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {session && !isPending ? (
          <JourneyColumn
            userId={session.user.id}
            initialTab="achievements"
            achievementsInitialData={achievements}
          />
        ) : (
          /* JourneyColumn owns the header once signed in (its tab bar *is* the
             header, deliberately title-less — its tab bar fills the row). The
             gate states have no tab bar to show, so they carry the page's own
             title instead: a bare header would render as an empty bordered strip
             on desktop, where the drawer button is md:hidden. Key/icon match
             AchievementsColumn's standalone header. */
          <>
            <ColumnHeader
              icon={Trophy}
              title={tFeed('achievements-header', { defaultValue: 'Achievements' })}
            />
            {isPending ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
                <p className="font-medium text-site-text">
                  {t('sign-in-to-track-achievements', {
                    defaultValue: 'Sign in to track achievements',
                  })}
                </p>
                <Link to="/login" search={{ callbackURL: '/achievements' }}>
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
