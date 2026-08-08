import { motion } from 'framer-motion';
import { popIn } from '@/lib/motion';
import { useTranslation } from 'react-i18next';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { GameEngine } from '@/lib/slice-it/engine';
import { useRunSummary, useSubmitScore } from '@/lib/slice-it/useSubmitScore';
import { gradeFor } from '@/lib/slice-it/scoring';
import { JUDGEMENT_COLORS, JUDGEMENT_ORDER, RANKED_MIN_SPEED } from '@/lib/slice-it/constants';
import type { RunStats } from '@/lib/slice-it/types';
import type { TimingSummary } from '@/lib/slice-it/integrity';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RotateCcw, Home, Trophy, Wand2 } from 'lucide-react';
import { offsetAdvice } from '@/lib/slice-it/timing-advice';

interface GameOverProps {
  onRetry?: () => void;
  /**
   * The engine that produced this run. It is the only thing that knows the
   * run's note count and hit-timing distribution, which the score endpoint
   * checks; without it the submission just carries less evidence.
   */
  engine?: GameEngine | null;
}

export function GameOver({ onRetry, engine }: GameOverProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const { score, multiplier, maxCombo, accuracy, modifiers, resetRun } = useSliceItStore();
  const audioOffset = useSliceItStore((s) => s.audioOffset);
  const setAudioOffset = useSliceItStore((s) => s.setAudioOffset);

  // Submission (and its once-only guard) lives in one place now — both results
  // screens used to carry their own copy with different guards.
  const summary = useRunSummary(false, engine);
  const { isNewBest, previousBest } = useSubmitScore(summary);
  const isUnranked = modifiers.speed < RANKED_MIN_SPEED;

  // Read once per render, not per section: `getRunStats()` copies the histogram,
  // and four callers would be four copies of it a frame.
  const stats: RunStats | null = engine?.getRunStats() ?? null;
  const timing: TimingSummary | null = engine?.getTimingStats() ?? null;

  const accuracyPct = (accuracy * 100).toFixed(2);
  const accuracyColor =
    accuracy >= 1.0
      ? 'text-cyan-500'
      : accuracy >= 0.95
        ? 'text-green-500'
        : accuracy >= 0.8
          ? 'text-yellow-500'
          : 'text-slice-text-muted';

  // The delta against your own best is the most motivating single number here,
  // and it is the one that decides whether the player presses Retry.
  const bestDelta = previousBest !== null ? score - previousBest : null;

  /**
   * The one-tap offset suggestion — `offsetAdvice()` in
   * `lib/slice-it/timing-advice.ts`.
   *
   * This used to be three local constants (min samples, min mean, max stdDev).
   * They were reasonable numbers, but they were a second answer to "is this
   * bias real" for a setting the calibration screen also writes. The shared
   * rule compares the mean against its own standard error, which is the honest
   * test and does not need a magic spread ceiling.
   */
  const advice = offsetAdvice(timing);
  const suggestedOffset = advice?.confident ? advice.suggestedDeltaMs : null;

  const judgementPeak = stats ? Math.max(1, ...JUDGEMENT_ORDER.map((j) => stats.judgements[j])) : 1;

  return (
    <div className="absolute inset-0 z-50 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain bg-slice-bg/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md bg-slice-bg text-slice-text shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] border-none rounded-[2rem] overflow-hidden">
        <CardHeader className="text-center pb-2 pt-8">
          <CardTitle
            className={`text-4xl sm:text-5xl font-black tracking-tight ${
              stats?.failed ? 'text-red-500' : 'text-blue-500'
            }`}
          >
            {stats?.failed
              ? stats.failReason === 'perfectionist'
                ? ts('perfectionist-failed', { defaultValue: 'NOT PERFECT' })
                : ts('gauge-failed', { defaultValue: 'GAUGE EMPTY' })
              : t('complete', { defaultValue: 'COMPLETE' })}
          </CardTitle>
          {isUnranked && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mx-auto">
              <span>{t('unranked', { defaultValue: 'Unranked' })}</span>
              <span className="text-[9px] font-normal normal-case tracking-normal text-orange-400">
                {t('speed-below', { defaultValue: 'Speed below 1.0x' })}
              </span>
            </div>
          )}
          {/* Full-combo and all-marvellous lamps, in the genre's escalation. */}
          {stats && stats.notesResolved > 0 && (stats.isFullCombo || stats.isPerfect) && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.3em] px-3 py-1.5 rounded-full mx-auto bg-slice-bg shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]">
              <span className={stats.isPerfect ? 'text-cyan-500' : 'text-emerald-500'}>
                {stats.isPerfect
                  ? ts('lamp-perfect', { defaultValue: 'Perfect' })
                  : ts('lamp-full-combo', { defaultValue: 'Full Combo' })}
              </span>
            </div>
          )}
          {stats?.gaugeBroken && !stats.failed && (
            <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slice-text-light">
              {ts('gauge-bonus-lost', { defaultValue: 'Gauge broke — bonus forfeited' })}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6 text-center relative z-10 p-8">
          <div className="space-y-1">
            <div className="text-sm text-slice-text-light uppercase tracking-widest font-bold">
              {t('final-score', { defaultValue: 'Final Score' })}
            </div>
            {previousBest !== null && !isNewBest && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-slice-text-light">
                {t('previous-best', {
                  defaultValue: 'Best: {{score}}',
                  score: previousBest.toLocaleString(),
                })}
              </div>
            )}
            <div className="text-4xl sm:text-6xl font-bold text-slice-text relative inline-block tabular-nums">
              {score.toLocaleString()}
              {isNewBest && (
                <motion.div
                  className="absolute -top-6 -right-12 rotate-12 duration-500"
                  variants={popIn}
                  initial="initial"
                  animate="animate"
                >
                  <div className="bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-md shadow-lg flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    {t('new-best', { defaultValue: 'NEW BEST!' })}
                  </div>
                </motion.div>
              )}
            </div>
            {bestDelta !== null && (
              <div
                className={`text-xs font-bold tabular-nums ${
                  bestDelta > 0 ? 'text-emerald-500' : 'text-slice-text-light'
                }`}
              >
                {bestDelta > 0
                  ? ts('best-delta-up', {
                      defaultValue: '+{{delta}} on your best',
                      delta: bestDelta.toLocaleString(),
                    })
                  : ts('best-delta-down', {
                      defaultValue: '{{delta}} from your best',
                      delta: Math.abs(bestDelta).toLocaleString(),
                    })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
              <div className="text-xs text-slice-text-light uppercase font-bold">
                {t('max-chain', { defaultValue: 'Max Chain' })}
              </div>
              <div className="text-xl font-bold text-slice-text-darker">
                {maxCombo > 0 ? `${maxCombo}x` : '--'}
              </div>
            </div>
            <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
              <div className="text-xs text-slice-text-light uppercase font-bold">
                {t('accuracy', { defaultValue: 'Accuracy' })}
              </div>
              <div className={`text-xl font-bold font-mono ${accuracyColor}`}>{accuracyPct}%</div>
              <div className="text-[10px] font-black text-slice-text-light uppercase tracking-widest">
                {t('grade-label', { defaultValue: 'Grade {{grade}}', grade: gradeFor(accuracy) })}
              </div>
            </div>
            <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
              <div className="text-xs text-slice-text-light uppercase font-bold">
                {t('speed', { defaultValue: 'Speed' })}
              </div>
              <div className="text-xl font-bold text-slice-text-darker">
                {multiplier.toFixed(1)}x
              </div>
            </div>
          </div>

          {/* Judgement histogram.
              Bars are scaled to the largest count, not to the note total: on a
              good run MARVELOUS dwarfs everything and a total-scaled chart is one
              bar and five slivers, which hides exactly the distribution the
              player came to read. */}
          {stats && stats.notesResolved > 0 && (
            <dl className="bg-slice-bg px-4 py-3 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] space-y-1.5 text-left">
              {JUDGEMENT_ORDER.map((judgement) => (
                <div key={judgement} className="flex items-center gap-2">
                  <dt
                    className="w-20 shrink-0 text-[10px] font-black uppercase tracking-wider"
                    style={{ color: JUDGEMENT_COLORS[judgement] }}
                  >
                    {judgement}
                  </dt>
                  <div className="flex-1 h-2 rounded-full bg-slice-shadow-dark/25 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(stats.judgements[judgement] / judgementPeak) * 100}%`,
                        background: JUDGEMENT_COLORS[judgement],
                      }}
                    />
                  </div>
                  <dd className="w-10 shrink-0 text-right font-mono text-xs text-slice-text-darker tabular-nums">
                    {stats.judgements[judgement]}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* Timing distribution.
              Unstable rate is stdDev x 10 by convention (osu!), which puts a
              typical run in the 60–200 range instead of 6–20 — a scale players
              in this genre already read. */}
          {timing && timing.samples > 0 && (
            <div className="bg-slice-bg px-4 py-3 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] text-left">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slice-text-light font-bold uppercase tracking-wider text-[10px]">
                  {ts('unstable-rate', { defaultValue: 'Unstable rate' })}
                </dt>
                <dd className="font-mono text-right text-slice-text-darker tabular-nums">
                  {(timing.stdDevMs * 10).toFixed(0)}
                </dd>
                <dt className="text-slice-text-light font-bold uppercase tracking-wider text-[10px]">
                  {ts('timing-bias', { defaultValue: 'Bias' })}
                </dt>
                <dd className="font-mono text-right text-slice-text-darker tabular-nums">
                  {Math.abs(timing.meanMs).toFixed(1)} ms{' '}
                  {timing.meanMs < 0
                    ? ts('timing-early', { defaultValue: 'early' })
                    : ts('timing-late', { defaultValue: 'late' })}
                </dd>
              </dl>

              {/* One-tap calibration. The measurement already exists — it is
                  submitted with every score for the integrity check — so the
                  only thing standing between the player and a correct offset was
                  nobody offering it to them. */}
              {suggestedOffset !== null && (
                <Button
                  variant="ghost"
                  className="mt-3 w-full h-auto py-2.5 bg-slice-bg text-slice-text-darker text-[11px] font-bold normal-case tracking-normal rounded-xl shadow-[4px_4px_10px_var(--slice-shadow-dark),-4px_-4px_10px_var(--slice-shadow-light)] active:shadow-inner border-none flex items-center justify-center gap-2 whitespace-normal"
                  onClick={() => setAudioOffset(audioOffset + suggestedOffset)}
                >
                  <Wand2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {suggestedOffset > 0
                    ? ts('apply-offset-late', {
                        defaultValue: 'You hit late by {{ms}} ms on average — apply offset?',
                        ms: Math.abs(suggestedOffset),
                      })
                    : ts('apply-offset-early', {
                        defaultValue: 'You hit early by {{ms}} ms on average — apply offset?',
                        ms: Math.abs(suggestedOffset),
                      })}
                </Button>
              )}
            </div>
          )}

          <div className="flex gap-4">
            <Button
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-widest text-sm h-14 rounded-xl shadow-lg transition-colors border-none flex items-center justify-center gap-2 group"
              onClick={onRetry}
            >
              <RotateCcw className="w-4 h-4 group-hover:rotate-[-120deg] transition-transform" />
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
            <Button
              variant="ghost"
              className="flex-1 bg-slice-bg hover:bg-slice-shadow-dark/20 text-slice-text-muted font-bold uppercase tracking-widest text-sm h-14 rounded-xl shadow-[4px_4px_10px_var(--slice-shadow-dark),-4px_-4px_10px_var(--slice-shadow-light)] active:shadow-inner transition-colors border-none flex items-center justify-center gap-2"
              onClick={resetRun}
            >
              <Home className="w-4 h-4" />
              {t('menu', { defaultValue: 'Menu' })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
