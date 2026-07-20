import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { Gamepad2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { auth } from '@/lib/auth';
import { getArcadeState } from '@/lib/game/results.server';
import { ArcadeHub } from '@/components/arcade/ArcadeHub';

// Prefetch the viewer's arcade state server-side so the challenge cards are
// present at first paint. Signed-out visitors get `null` (the page shows the
// sign-in prompt instead), mirroring achievements.tsx.
const fetchArcade = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { state: null };
  return { state: await getArcadeState(session.user.id) };
});

export const Route = createFileRoute('/_site/arcade')({
  head: () => ({ meta: [{ title: 'Arcade Pass | RMH Studios' }] }),
  loader: () => fetchArcade(),
  component: ArcadePage,
});

function ArcadePage() {
  const { t } = useTranslation('site');
  const { state } = Route.useLoaderData();
  const { data: session, isPending } = useSession();
  const title = t('arcade-title', { defaultValue: 'Arcade Pass' });

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {/* Mobile-only header; the desktop header lives inside ArcadeHub (signed
            in) or the gate block below, both `hidden md:flex`, so mobile never
            shows two stacked headers. */}
        <MobileTopBar title={title} />

        {session && !isPending ? (
          <ArcadeHub initialState={state} />
        ) : (
          <>
            <header className="hidden md:flex items-center gap-2 border-b border-site-border px-5 py-4">
              <Gamepad2 className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
              <h1 className="font-(family-name:--site-font-display) text-2xl font-semibold tracking-[-0.022em] text-site-text">
                {title}
              </h1>
            </header>
            {isPending ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
                <p className="font-medium text-site-text">
                  {t('arcade-sign-in', {
                    defaultValue: 'Sign in to play the daily arcade challenges',
                  })}
                </p>
                <Link to="/login" search={{ callbackURL: '/arcade' }}>
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
