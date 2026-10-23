'use client';

/**
 * The Arcade section — the player block at the top of `/games`.
 *
 * The former standalone `/arcade` destination. It was folded into Create's Games
 * tab, and moved to `/games` (under the Ranked summary) when that tab was
 * removed. Both of the original page's surfaces have travelled with it the whole
 * way — today's daily **Challenges** and the global player **Leaderboard** —
 * behind a compact sub-tab strip, so nothing lost a home at either step.
 * `/arcade` and `/leaderboard` redirect here.
 *
 * The sub-tab is mirrored into `?sub=` by the route (see `sub`/`onSubChange`)
 * rather than held locally, so `/leaderboard` deep-links land on the board even
 * when the viewer is *already* on `/games` and the page never remounts.
 *
 * Both surfaces load client-side: this block sits above a catalog most visitors
 * came for, so seeding either query from the route loader would charge every
 * visit to `/games` for a panel many of them never open — and `/games` is a
 * public, indexed page, so that cost would fall on crawlers too. The challenge
 * board self-fetches (`ArcadeHub` with no `initialState`); the leaderboard is
 * pulled the first time its tab is opened and then cached for the life of the
 * page.
 */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Trophy } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { ArcadeHub } from '@/components/arcade/ArcadeHub';
import { LeaderboardColumn } from '@/components/feed/LeaderboardColumn';

import type { ArcadeSubTab } from './arcade-tabs';

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
    <section className="glass-pane rounded-site" aria-labelledby="cstudio-arcade-title">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="glass-inset flex size-9 shrink-0 items-center justify-center rounded-site-sm text-site-accent"
          aria-hidden="true"
        >
          <Gamepad2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {/* The audit's AUD-326 complaint about the old /arcade page was that its
              only name lived in a tab strip's aria-label. Inside Create the
              section states its own name. */}
          <h2 className="font-semibold text-site-text" id="cstudio-arcade-title">
            {title}
          </h2>
          <p className="hidden truncate text-sm text-site-text-muted sm:block">
            {t('arcade-summary', {
              defaultValue: 'Daily game challenges, your streak, and the player leaderboard.',
            })}
          </p>
        </div>
      </div>

      <div className="px-4 pb-3">
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
          className="border-t border-site-border"
          role="tabpanel"
          id="cstudio-arcade-panel-challenges"
          aria-labelledby="cstudio-arcade-tab-challenges"
        >
          {signedIn ? (
            <ArcadeHub initialState={null} hideHeader />
          ) : isPending ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <EmptyState
              icon={Gamepad2}
              title={t('arcade-sign-in', {
                defaultValue: 'Sign in to play the daily arcade challenges',
              })}
              action={
                <Button asChild variant="accent">
                  <Link to="/login" search={{ callbackURL: '/games' }}>
                    {t('sign-in', { defaultValue: 'Sign in' })}
                  </Link>
                </Button>
              }
            />
          )}
        </div>
      )}

      {sub === 'leaderboard' && (
        <div
          className="border-t border-site-border"
          role="tabpanel"
          id="cstudio-arcade-panel-leaderboard"
          aria-labelledby="cstudio-arcade-tab-leaderboard"
        >
          {board ? (
            <LeaderboardColumn initialData={board} signedIn={signedIn} hideHeader />
          ) : boardFailed ? (
            <EmptyState
              icon={Trophy}
              title={t('leaderboard-failed', {
                defaultValue: 'Could not load the leaderboard just now.',
              })}
            />
          ) : (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
