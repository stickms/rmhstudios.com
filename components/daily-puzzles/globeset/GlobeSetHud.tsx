'use client';

/**
 * The run's instrument panel: clock, deck progress, GlobeSets taken, and the two
 * ways out — a hint, and the solver.
 *
 * What is deliberately NOT here is the dead-end count. It is recorded during
 * play and shown in the results, because a live counter would let a player
 * binary-search the board by watching it tick (`lib/globeset/game.ts`
 * `recordDeadEnd` explains the reasoning). The clock and the deck are safe to
 * show: neither says anything about which cards go together.
 */

import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Clock, Flag, Layers, Lightbulb, Sparkles } from 'lucide-react';
import { formatDuration } from '@/lib/globeset/game';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Button } from '@/components/ui/button';

export interface GlobeSetHudProps {
  elapsedSeconds: number;
  /** 0–1 through the deck. */
  progress: number;
  cardsLeft: number;
  globeSets: number;
  hints: number;
  /** Hint and solver are unavailable once the run is over or the solver is running. */
  locked: boolean;
  onHint: () => void;
  onGiveUp: () => void;
}

export function GlobeSetHud({
  elapsedSeconds,
  progress,
  cardsLeft,
  globeSets,
  hints,
  locked,
  onHint,
  onGiveUp,
}: GlobeSetHudProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const reduced = useReducedMotion();

  return (
    <div className="glass-pane rounded-site p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Stat
            icon={<Clock className="h-4 w-4" aria-hidden />}
            label={t('globeset-stat-time', { defaultValue: 'Time' })}
            value={formatDuration(elapsedSeconds)}
            mono
          />
          <Stat
            icon={<Layers className="h-4 w-4" aria-hidden />}
            label={t('globeset-stat-cards-left', { defaultValue: 'Cards left' })}
            value={String(cardsLeft)}
            mono
          />
          <Stat
            icon={<Sparkles className="h-4 w-4" aria-hidden />}
            label={t('globeset-stat-globesets', { defaultValue: 'Sets' })}
            value={String(globeSets)}
            mono
          />
        </dl>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onHint} disabled={locked}>
            <Lightbulb className="h-4 w-4" aria-hidden />
            {hints > 0
              ? t('globeset-hint-again', { defaultValue: 'Hint ({{n}})', n: hints })
              : t('globeset-hint', { defaultValue: 'Hint' })}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onGiveUp} disabled={locked}>
            <Flag className="h-4 w-4" aria-hidden />
            {t('globeset-give-up', { defaultValue: 'Solve it for me' })}
          </Button>
        </div>
      </div>

      {/* A scaleX fill rather than an animated width: width is a layout property
          and animating it reflows the whole panel every frame. */}
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-site-bg-subtle"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={t('globeset-progress-label', { defaultValue: 'Deck cleared' })}
      >
        <motion.div
          className="h-full origin-left rounded-full bg-site-accent"
          initial={false}
          animate={{ scaleX: Math.max(0.005, progress) }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }}
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-site-accent">{icon}</span>
      <div>
        <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-site-text-muted">
          {label}
        </dt>
        <dd
          className={`text-lg font-bold leading-tight text-site-text ${mono ? 'font-mono tabular-nums' : ''}`}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
