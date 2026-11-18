import { lazy } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SpineItem } from '@/components/ui/spine';
import { ArrivalSuspense, useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { useSession } from '@/components/Providers';

/**
 * The signed-in composer (./HomeComposerSignedIn.tsx): the light row, its submit path, drafts and quick actions.
 *
 * Lazy, so the home page's critical path no longer carries it for the visitors who never see it: everyone signed out,
 * which is most first visits and every page the edge serves from its cache (low-bandwidth audit, 2026-11-18). Signed
 * in, the server still renders the row in full; while its code loads the server's markup stays in place (React
 * hydrates the boundary when the chunk arrives), so nothing moves. On a client navigation before the chunk has
 * loaded, the fallback holds the row's exact height, and the row fades in (M9) as the session's did.
 */
const HomeComposerSignedIn = lazy(() => import('./HomeComposerSignedIn'));

/**
 * The home composer row: the first item on the spine, dotless (P3). Signed out it is a one-line sign-in prompt in the
 * same place and the same height (plan section 18, D6), and the sign-in button is that view's one primary (R4). While
 * the session is still unknown the row holds its height empty, so nothing shifts when it resolves. Signed in it is the
 * composer, described on ./HomeComposerSignedIn.tsx.
 */
export function HomeComposer() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  // Steel M9: when the session resolves on the client, what replaces the empty row fades in.
  const arrival = useArrival(!isPending);

  if (session) {
    return (
      // `wrap={false}`: the spine styles its direct children, so the row takes the fade
      // itself (useSuspenseArrival in ./HomeComposerSignedIn) instead of a wrapper.
      <ArrivalSuspense
        wrap={false}
        fallback={
          <SpineItem dot={false} className="home-composer" data-slot="home-composer">
            <div className="home-composer__row" aria-hidden />
          </SpineItem>
        }
      >
        <HomeComposerSignedIn arrival={arrival} />
      </ArrivalSuspense>
    );
  }

  return (
    <SpineItem dot={false} className="home-composer" data-slot="home-composer">
      {isPending ? (
        <div className="home-composer__row" aria-hidden />
      ) : (
        <div className={cn('home-composer__row', arrival)}>
          <p className="t-body min-w-0 flex-1 text-site-text-muted">
            {t('sign-in-prompt', { defaultValue: 'Sign in to post RMHarks' })}
          </p>
          <Button asChild variant="primary">
            <Link to="/login" search={{ callbackURL: undefined }}>
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          </Button>
        </div>
      )}
    </SpineItem>
  );
}
