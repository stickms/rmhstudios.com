'use client';

/**
 * Arcade Pass hub — the daily-challenge board.
 *
 * Renders the viewer's streak, a live countdown to the next UTC reset, and the
 * three challenge cards (game art, progress, a "Play now" link, and a Claim
 * button once completed). Data is seeded from the page loader; claims POST to
 * `/api/arcade/claim` and then re-pull `/api/arcade/` so the board stays honest.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Check, Clock, Flame, Gamepad2, Gift, Play, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { games } from '@/lib/games';
import type { ArcadeState, ArcadeChallengeView } from '@/lib/quests/arcade';

/** Milliseconds until the next UTC midnight (when challenges rotate). */
function msToUtcReset(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return next - now.getTime();
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function ArcadeHub({
  initialState,
  hideHeader = false,
}: {
  initialState: ArcadeState | null;
  /** Hide the built-in desktop header (e.g. when hosted under the /arcade tab bar). */
  hideHeader?: boolean;
}) {
  const { t } = useTranslation('site');
  const router = useRouter();
  const [state, setState] = useState<ArcadeState | null>(initialState);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // Live UTC-reset countdown. Set client-side only (avoids a hydration mismatch
  // on the ticking text).
  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(msToUtcReset()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/arcade/', { credentials: 'include' });
      if (!res.ok) return;
      setState((await res.json()) as ArcadeState);
    } catch {
      /* best-effort refresh */
    }
    // Keep the route loader's copy fresh for back-navigation.
    void router.invalidate();
  }, [router]);

  // Rare: signed-in shell rendered before the loader had a server session.
  useEffect(() => {
    if (!initialState) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function claim(challengeId: string) {
    setClaiming(challengeId);
    try {
      const res = await fetch('/api/arcade/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        xp?: number;
        coins?: number;
      };
      if (!res.ok) {
        toast.error(
          data.error ?? t('arcade-claim-failed', { defaultValue: 'Could not claim reward' }),
        );
        return;
      }
      toast.success(
        t('arcade-claimed', {
          xp: data.xp ?? 0,
          coins: data.coins ?? 0,
          defaultValue: 'Reward claimed! +{{xp}} XP, +{{coins}} coins',
        }),
      );
      await refresh();
    } catch {
      toast.error(t('arcade-claim-failed', { defaultValue: 'Could not claim reward' }));
    } finally {
      setClaiming(null);
    }
  }

  if (!state) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const { streak, challenges } = state;

  return (
    <div>
      {/* Desktop header row (mobile uses MobileTopBar from the page). */}
      {!hideHeader && (
        <div className="hidden md:flex items-center gap-2 border-b border-site-border px-5 py-4">
          <Gamepad2 className="h-5 w-5 text-site-accent" aria-hidden />
          <h1 className="font-(family-name:--site-font-display) text-2xl font-semibold tracking-[-0.022em] text-site-text">
            {t('arcade-title', { defaultValue: 'Arcade Pass' })}
          </h1>
        </div>
      )}

      <div className="space-y-5 px-4 py-5 sm:px-5">
        {/* Streak + reset countdown */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-site border border-site-border bg-site-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-site bg-site-accent/15 text-site-accent">
              <Flame className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none text-site-text">
                {streak.current}
                <span className="ml-1.5 text-sm font-medium text-site-text-dim">
                  {t('arcade-day-streak', { defaultValue: 'day streak' })}
                </span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-site-text-dim">
                <Trophy className="h-3 w-3" aria-hidden />
                {t('arcade-best-streak', { best: streak.best, defaultValue: 'Best: {{best}}' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-site-text-muted" aria-live="off">
            <Clock className="h-4 w-4 text-site-text-dim" aria-hidden />
            <span>
              {t('arcade-resets-in', { defaultValue: 'Resets in' })}{' '}
              <span className="font-mono tabular-nums text-site-text">
                {countdown ?? '--:--:--'}
              </span>
            </span>
          </div>
        </div>

        {/* Challenge cards */}
        <div className="space-y-3">
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              busy={claiming === c.id}
              onClaim={() => claim(c.id)}
            />
          ))}
        </div>

        {/* How it works */}
        <div className="rounded-site border border-site-border bg-site-surface/60 p-4">
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            {t('arcade-how-title', { defaultValue: 'How it works' })}
          </h2>
          <p className="text-sm leading-relaxed text-site-text-muted">
            {t('arcade-how-body', {
              defaultValue:
                'Three new game challenges drop every day. Hit the target in the listed game to complete a challenge, then claim your XP and coins here. Complete at least one each day to keep your streak alive — challenges reset at midnight UTC.',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChallengeCard({
  challenge,
  busy,
  onClaim,
}: {
  challenge: ArcadeChallengeView;
  busy: boolean;
  onClaim: () => void;
}) {
  const { t } = useTranslation('site');
  const game = games.find((g) => g.id === challenge.game);
  const pct = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
  const claimable = challenge.completed && !challenge.claimed;

  return (
    <div className="flex items-stretch gap-3 rounded-site border border-site-border bg-site-surface p-3">
      {/* Game art */}
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-site-sm bg-site-bg">
        {game?.imagePath ? (
          <OptimizedImage
            src={game.imagePath}
            alt={game.title}
            width={112}
            height={80}
            layout="fullWidth"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-site-text-dim">
            <Gamepad2 className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-semibold text-site-text">{challenge.title}</p>
        {game && <p className="mt-0.5 text-xs text-site-text-dim">{game.title}</p>}

        <div className="mt-auto pt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-site-bg">
            <div className="h-full rounded-full bg-site-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-site-text-dim">
            <span className="tabular-nums">
              {challenge.progress} / {challenge.target}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-0.5">
              <Zap className="h-3 w-3 text-site-accent" aria-hidden /> {challenge.xp}
            </span>
            {challenge.coins > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <CoinIcon className="h-3 w-3" /> {challenge.coins}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="flex shrink-0 flex-col items-end justify-center gap-2">
        {challenge.claimed ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-site-text-dim">
            <Check className="h-3.5 w-3.5" aria-hidden />{' '}
            {t('arcade-claimed-label', { defaultValue: 'Claimed' })}
          </span>
        ) : claimable ? (
          <Button size="sm" variant="accent" loading={busy} onClick={onClaim} className="gap-1">
            {!busy && <Gift className="h-3.5 w-3.5" aria-hidden />}
            {t('arcade-claim', { defaultValue: 'Claim' })}
          </Button>
        ) : game ? (
          <Link to={game.href}>
            <Button size="sm" variant="outline" className="gap-1">
              <Play className="h-3.5 w-3.5" aria-hidden />
              {t('arcade-play-now', { defaultValue: 'Play now' })}
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
