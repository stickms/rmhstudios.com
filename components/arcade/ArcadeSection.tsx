/**
 * The Arcade section — the Arcade Pass block on `/arcade`: today's daily
 * challenges and the viewer's streak.
 *
 * The former standalone `/arcade` destination. It was folded into Create's Games
 * tab, moved to `/games` (under the Ranked summary) when that tab was removed,
 * and back to `/arcade` when `/games` became the library. It used to carry the
 * global player **Leaderboard** behind a second sub-tab; the 2026-11-19
 * consolidation moved that board to `/compete`, with the other standings, so
 * `/leaderboard` and `/arcade?sub=leaderboard` land there now and this block has
 * one surface and no sub-tab strip.
 *
 * The challenge board self-fetches (`ArcadeHub` with no `initialState`).
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { ArcadeHub } from '@/components/arcade/ArcadeHub';

export function ArcadeSection() {
  const { t } = useTranslation('site');
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session);
  const sessionArrival = useArrival(!isPending);

  return (
    <section className="rounded-site" aria-labelledby="cstudio-arcade-title">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="surface-field flex size-9 shrink-0 items-center justify-center rounded-site-sm text-site-accent"
          aria-hidden="true"
        >
          <Gamepad2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-site-text" id="cstudio-arcade-title">
            {t('arcade-title', { defaultValue: 'Arcade Pass' })}
          </h2>
          <p className="hidden truncate text-sm text-site-text-muted sm:block">
            {t('arcade-summary-challenges', {
              defaultValue: 'Daily game challenges and your streak.',
            })}
          </p>
        </div>
      </div>

      <div className="border-t border-site-border">
        {signedIn ? (
          <div className={sessionArrival}>
            <ArcadeHub initialState={null} hideHeader />
          </div>
        ) : isPending ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <EmptyState
            className={sessionArrival}
            icon={Gamepad2}
            title={t('arcade-sign-in', {
              defaultValue: 'Sign in to play the daily arcade challenges',
            })}
            action={
              <Button asChild variant="default">
                <Link to="/login" search={{ callbackURL: '/arcade' }}>
                  {t('sign-in', { defaultValue: 'Sign in' })}
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}
