'use client';

/**
 * Arcade Pass hub — the daily-challenge board.
 *
 * Renders the viewer's streak, a live countdown to the next UTC reset, and the
 * three challenge cards (game art, progress, a "Play now" link, and a Claim
 * button once completed). Claims POST to `/api/arcade/claim` and then re-pull
 * `/api/arcade/` so the board stays honest.
 *
 * Its host is `ArcadeSection` (the Arcade Pass block of Create's Games tab),
 * which mounts it with no `initialState` — the board self-fetches. Nothing seeds
 * it from a route loader any more, so a refresh here has no loader copy to
 * invalidate; it owns its own state end to end.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Clock, Flame, Gamepad2, Gift, Play, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { games } from '@/lib/games';
import { APPLE_SPRING } from '@/lib/motion';
import { usePointerParallax } from '@/hooks/usePointerParallax';
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
  /** Hide the built-in header (the host section already names the surface). */
  hideHeader?: boolean;
}) {
  const { t } = useTranslation('site');
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
  }, []);

  // The host mounts us empty, so this first pull is the normal path (not the
  // exception it was when a route loader seeded the board).
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
      {/* Desktop header row (on mobile the page's tab strip is the chrome). */}
      {!hideHeader && (
        <div className="flex items-center gap-2 border-b border-site-border px-5 py-4 max-md:sr-only max-md:border-b-0">
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
                <span className="ml-1.5 text-sm font-medium text-site-text-muted">
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
  const parallax = usePointerParallax({ strength: 10, tilt: 3 });
  const game = games.find((g) => g.id === challenge.game);
  const pct = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
  const claimable = challenge.completed && !challenge.claimed;

  return (
    // Apple depth: the card is a stack of planes, not a flat rectangle. The art
    // sits furthest back and drifts most against the pointer (or the phone's
    // tilt), the content sits nearly on the surface, and the whole card springs
    // under a press. Everything rides MotionValues straight to the compositor,
    // so a grid of these costs no per-frame React work — and it all collapses to
    // a static card under prefers-reduced-motion.
    <motion.div
      ref={parallax.ref as React.RefObject<HTMLDivElement>}
      className="flex flex-col items-stretch gap-3 rounded-site border border-site-border bg-site-surface p-3 [transform-style:preserve-3d] sm:flex-row"
      style={{ rotateX: parallax.near.rotateX, rotateY: parallax.near.rotateY }}
      whileHover={{ scale: 1.008 }}
      whileTap={{ scale: 0.994 }}
      transition={APPLE_SPRING.press}
    >
      {/* Game art */}
      <motion.div
        className="relative h-20 w-full shrink-0 overflow-hidden rounded-site-sm bg-site-bg sm:w-28"
        style={{ x: parallax.far.x, y: parallax.far.y }}
      >
        {game?.imagePath ? (
          <OptimizedImage
            src={game.imagePath}
            alt={game.title}
            width={112}
            height={80}
            layout="fullWidth"
            className="h-full w-full scale-110 object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-site-text-dim">
            <Gamepad2 className="h-6 w-6" aria-hidden />
          </div>
        )}
      </motion.div>

      {/* Details */}
      <motion.div
        className="flex min-w-0 flex-1 flex-col"
        style={{ x: parallax.near.x, y: parallax.near.y }}
      >
        <p className="text-sm font-semibold text-site-text">{challenge.title}</p>
        {game && <p className="mt-0.5 text-xs text-site-text-muted">{game.title}</p>}

        <div className="mt-auto pt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-site-bg">
            <div className="h-full rounded-full bg-site-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-site-text-muted">
            <span className="whitespace-nowrap tabular-nums">
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
      </motion.div>

      {/* Action */}
      <div className="flex shrink-0 flex-col items-stretch justify-center gap-2 sm:items-end">
        {challenge.claimed ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-site-text-muted">
            <Check className="h-3.5 w-3.5" aria-hidden />{' '}
            {t('arcade-claimed-label', { defaultValue: 'Claimed' })}
          </span>
        ) : claimable ? (
          <Button
            variant="accent"
            loading={busy}
            onClick={onClaim}
            className="w-full gap-1 sm:w-auto"
          >
            {!busy && <Gift className="h-3.5 w-3.5" aria-hidden />}
            {t('arcade-claim', { defaultValue: 'Claim' })}
          </Button>
        ) : game ? (
          // asChild: a <button> inside an <a> is invalid HTML and gives keyboard
          // users two focus stops for one action.
          <Button asChild variant="outline" className="w-full gap-1 sm:w-auto">
            <Link to={game.href}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              {t('arcade-play-now', { defaultValue: 'Play now' })}
            </Link>
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
