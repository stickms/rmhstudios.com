'use client';

/**
 * What the player gets at the end: the time, the grid they can paste, the two
 * numbers the run was quietly keeping (dead ends and hints), their own record,
 * and the day's board.
 *
 * The emoji grid is rendered from the same `shareGrid()` the clipboard text
 * uses, so what is on screen and what lands in the group chat cannot drift.
 */

import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { Flag, Flame, Share2, Timer, Trophy } from 'lucide-react';
import { formatDuration, type RunSummary } from '@/lib/globeset/game';
import { accuracy, generateGlobeSetShare, shareGrid, SIZE_LEGEND } from '@/lib/globeset/share';
import type { GlobeSetStats } from '@/lib/globeset/persistence';
import { CopyButton } from '@/components/ui/copy-button';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';

export interface GlobeSetResultsProps {
  summary: RunSummary;
  points: number;
  stats: GlobeSetStats;
  streak: number;
  /** Index of the first GlobeSet the solver took, when it was used. */
  solverFrom?: number;
  dateKey: string;
  isToday: boolean;
}

export function GlobeSetResults({
  summary,
  points,
  stats,
  streak,
  solverFrom,
  dateKey,
  isToday,
}: GlobeSetResultsProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const grid = shareGrid(summary.sizes, solverFrom);
  const shareText = generateGlobeSetShare(summary, { streak, solverFrom });

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 space-y-6"
      aria-label={t('globeset-results-label', { defaultValue: 'Your result' })}
    >
      <div className="glass-pane rounded-site p-6 text-center">
        {summary.solverUsed ? (
          <>
            <Flag className="mx-auto h-8 w-8 text-site-text-muted" aria-hidden />
            <h2 className="mt-2 text-2xl font-bold text-site-text">
              {t('globeset-solved-out', { defaultValue: 'Solved out' })}
            </h2>
            <p className="mt-1 text-sm text-site-text-muted">
              {t('globeset-solved-out-body', {
                defaultValue:
                  'The solver finished the deck. It does not go on the leaderboard — but the streak is safe.',
              })}
            </p>
          </>
        ) : (
          <>
            <Timer className="mx-auto h-8 w-8 text-site-accent" aria-hidden />
            <h2 className="mt-2 font-mono text-5xl font-extrabold tabular-nums text-site-text">
              {formatDuration(summary.timeSeconds)}
            </h2>
            <p className="mt-1 text-sm text-site-text-muted">
              {t('globeset-cleared-body', {
                defaultValue: 'Deck cleared — {{n}} sets, {{points}} points.',
                n: summary.sizes.length,
                points,
              })}
            </p>
          </>
        )}

        {/* ── The grid ─────────────────────────────────────────────────── */}
        <pre className="mt-5 select-all whitespace-pre text-center font-sans text-xl leading-relaxed">
          {grid}
        </pre>
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-site-text-muted">
          {SIZE_LEGEND.map((entry) => (
            <li key={entry.size}>
              <span aria-hidden>{entry.emoji}</span>{' '}
              {t('globeset-legend-cards', { defaultValue: '{{n}} cards', n: entry.size })}
            </li>
          ))}
        </ul>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure
            label={t('globeset-stat-globesets', { defaultValue: 'Sets' })}
            value={String(summary.sizes.length)}
          />
          <Figure
            label={t('globeset-stat-accuracy', { defaultValue: 'Accuracy' })}
            value={`${accuracy(summary)}%`}
          />
          <Figure
            label={t('globeset-stat-dead-ends', { defaultValue: 'Dead ends' })}
            value={String(summary.misses)}
          />
          <Figure
            label={t('globeset-stat-hints', { defaultValue: 'Hints' })}
            value={String(summary.hints)}
          />
        </dl>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <CopyButton
            value={shareText}
            variant="default"
            size="default"
            icon={Share2}
            toastOnCopy
            label={t('globeset-share', { defaultValue: 'Share result' })}
          >
            {t('globeset-share', { defaultValue: 'Share result' })}
          </CopyButton>
          <Link
            to="/daily"
            className="inline-flex items-center gap-1.5 rounded-full border border-site-border bg-site-surface px-4 py-2 text-sm font-medium text-site-text transition-colors hover:border-site-accent"
          >
            {t('back-to-daily-puzzles', { defaultValue: 'Back to Daily Puzzles' })}
          </Link>
        </div>
      </div>

      {/* ── The player's own record ──────────────────────────────────────── */}
      <div className="glass-fill grid grid-cols-3 gap-3 rounded-site p-4 text-center">
        <Figure
          icon={<Trophy className="h-4 w-4" aria-hidden />}
          label={t('globeset-stat-best', { defaultValue: 'Best time' })}
          value={stats.bestSeconds == null ? '—' : formatDuration(stats.bestSeconds)}
        />
        <Figure
          icon={<Flame className="h-4 w-4" aria-hidden />}
          label={t('stat-streak', { defaultValue: 'Day streak' })}
          value={String(streak)}
        />
        <Figure
          label={t('globeset-stat-runs', { defaultValue: 'Decks cleared' })}
          value={String(stats.runs)}
        />
      </div>

      <DailyPuzzleLeaderboard
        gameMode="globeset"
        dateKey={dateKey}
        completed={isToday}
        score={points}
        timeSeconds={summary.solverUsed ? null : summary.timeSeconds}
        hintUsed={summary.hints > 0}
        dnf={summary.solverUsed}
        resultJson={{
          sizes: summary.sizes,
          misses: summary.misses,
          hints: summary.hints,
          solverUsed: summary.solverUsed,
        }}
      />
    </motion.section>
  );
}

function Figure({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center justify-center gap-1 text-[0.65rem] font-medium uppercase tracking-wide text-site-text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-site-text">{value}</dd>
    </div>
  );
}
