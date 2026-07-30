'use client';

/**
 * Create · Arcade section.
 *
 * The former standalone `/arcade` destination, folded into the Games tab (it
 * sits directly under the Ranked summary). Both of that page's surfaces came
 * with it — today's daily **Challenges** and the global player **Leaderboard** —
 * behind a compact sub-tab strip, so nothing lost a home when the Arcade nav
 * wedge went away. `/arcade` and `/leaderboard` redirect here.
 *
 * The sub-tab is mirrored into `?sub=` by the route (see `sub`/`onSubChange`)
 * rather than held locally, so `/leaderboard` deep-links land on the board even
 * when the viewer is *already* on `/create` and the page never remounts.
 *
 * Both surfaces load client-side: Games is not the default tab of `/create`, so
 * seeding either query from the route loader would charge every visit to the
 * page for a panel most of them never open. The challenge board self-fetches
 * (`ArcadeHub` with no `initialState`); the leaderboard is pulled the first time
 * its tab is opened and then cached for the life of the page.
 */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Trophy } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { ArcadeHub } from '@/components/arcade/ArcadeHub';
import { LeaderboardColumn } from '@/components/feed/LeaderboardColumn';

export const ARCADE_SUB_TABS = ['challenges', 'leaderboard'] as const;
export type ArcadeSubTab = (typeof ARCADE_SUB_TABS)[number];

/** The board payload, taken from the column that renders it. */
type LeaderboardData = React.ComponentProps<typeof LeaderboardColumn>['initialData'];

export function ArcadeSection({
  sub,
  onSubChange,
}: {
  sub: ArcadeSubTab;
  onSubChange: (next: ArcadeSubTab) => void;
}) {
  const { t } = useTranslation('site');
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session);
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [boardFailed, setBoardFailed] = useState(false);

  // Pulled once, the first time the Leaderboard sub-tab is opened.
  useEffect(() => {
    if (sub !== 'leaderboard' || board || boardFailed) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/leaderboards/players?scope=global', {
          credentials: 'include',
        });
        if (!active) return;
        if (!res.ok) {
          setBoardFailed(true);
          return;
        }
        setBoard((await res.json()) as LeaderboardData);
      } catch {
        if (active) setBoardFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [sub, board, boardFailed]);

  const title = t('arcade-title', { defaultValue: 'Arcade Pass' });

  const tabs: LiquidTab[] = [
    {
      id: 'challenges',
      label: t('arcade-tab-challenges', { defaultValue: 'Challenges' }),
      icon: Gamepad2,
    },
    {
      id: 'leaderboard',
      label: t('arcade-tab-leaderboard', { defaultValue: 'Leaderboard' }),
      icon: Trophy,
    },
  ];

  return (
    <section className="cstudio-arcade" aria-labelledby="cstudio-arcade-title">
      <div className="cstudio-arcade__head">
        <span className="cstudio-arcade__icon" aria-hidden="true">
          <Gamepad2 size={18} />
        </span>
        <div className="cstudio-arcade__titles">
          {/* The audit's AUD-326 complaint about the old /arcade page was that its
              only name lived in a tab strip's aria-label. Inside Create the
              section states its own name. */}
          <h2 className="cstudio-arcade__title" id="cstudio-arcade-title">
            {title}
          </h2>
          <p className="cstudio-arcade__sub">
            {t('arcade-summary', {
              defaultValue: 'Daily game challenges, your streak, and the player leaderboard.',
            })}
          </p>
        </div>
      </div>

      <div className="cstudio-arcade__tabs">
        <LiquidTabs
          size="sm"
          tabs={tabs}
          value={sub}
          onChange={(id) => onSubChange(id as ArcadeSubTab)}
          idBase="cstudio-arcade"
          aria-label={title}
        />
      </div>

      {sub === 'challenges' && (
        <div
          className="cstudio-arcade__body"
          role="tabpanel"
          id="cstudio-arcade-panel-challenges"
          aria-labelledby="cstudio-arcade-tab-challenges"
        >
          {signedIn ? (
            <ArcadeHub initialState={null} hideHeader />
          ) : isPending ? (
            <div className="flex justify-center py-14">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="font-medium text-site-text">
                {t('arcade-sign-in', {
                  defaultValue: 'Sign in to play the daily arcade challenges',
                })}
              </p>
              <Link to="/login" search={{ callbackURL: '/create' }}>
                <Button variant="accent">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {sub === 'leaderboard' && (
        <div
          className="cstudio-arcade__body"
          role="tabpanel"
          id="cstudio-arcade-panel-leaderboard"
          aria-labelledby="cstudio-arcade-tab-leaderboard"
        >
          {board ? (
            <LeaderboardColumn initialData={board} signedIn={signedIn} hideHeader />
          ) : boardFailed ? (
            <p className="px-6 py-14 text-center text-sm text-site-text-muted">
              {t('leaderboard-failed', {
                defaultValue: 'Could not load the leaderboard just now.',
              })}
            </p>
          ) : (
            <div className="flex justify-center py-14">
              <Spinner />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
