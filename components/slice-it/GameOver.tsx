// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level.
import { m as motion } from 'framer-motion';
import { popIn } from '@/lib/motion';
import { useTranslation } from 'react-i18next';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { GameEngine } from '@/lib/slice-it/engine';
import { useRunSummary, useSubmitScore } from '@/lib/slice-it/useSubmitScore';
import { gradeFor } from '@/lib/slice-it/scoring';
import { JUDGEMENT_ORDER, RANKED_MIN_SPEED } from '@/lib/slice-it/constants';
import type { RunStats } from '@/lib/slice-it/types';
import type { TimingSummary } from '@/lib/slice-it/integrity';
import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
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
  // The chart's own name, which is what the score submission carries too.
  const songTitle = engine?.getActiveMap()?.name ?? null;
  const stats: RunStats | null = engine?.getRunStats() ?? null;
  const timing: TimingSummary | null = engine?.getTimingStats() ?? null;

  const accuracyPct = (accuracy * 100).toFixed(2);
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

  const grade = gradeFor(accuracy);
  const failedTitle = stats?.failed
    ? stats.failReason === 'perfectionist'
      ? ts('perfectionist-failed', { defaultValue: 'NOT PERFECT' })
      : ts('gauge-failed', { defaultValue: 'GAUGE EMPTY' })
    : null;

  return (
    <div className="slice-results absolute inset-0 z-50 overflow-y-auto overscroll-contain bg-slice-bg">
      <div className="slice-results__line">
        <span className="slice-chip">RMH-050</span>
        <span className="slice-label">
          {t('side-a', { defaultValue: 'Side A' })} <i>/</i>{' '}
          {t('end-of-side', { defaultValue: 'End of side' })}
        </span>
      </div>

      <div className="slice-results__grid">
        {/* The grade, cut on the slice. Two clips of the same letter, the lower one
            shifted along the cut; the real grade is read out by the label. */}
        <div className="slice-results__grade">
          <div className="slice-grade" aria-hidden>
            <span className="slice-grade__half slice-grade__half--top">{grade}</span>
            <span className="slice-grade__half slice-grade__half--bot">{grade}</span>
          </div>
          <span className="sr-only">
            {t('grade-label', { defaultValue: 'Grade {{grade}}', grade })}
          </span>
          {isNewBest && (
            <motion.div
              className="slice-results__best"
              variants={popIn}
              initial="initial"
              animate="animate"
            >
              <span className="slice-stamp text-pink-500">
                {t('new-best', { defaultValue: 'NEW BEST!' })}
              </span>
            </motion.div>
          )}
        </div>

        {/* The liner notes. */}
        <div className="slice-results__notes">
          <div className="slice-label">
            {t('side-a', { defaultValue: 'Side A' })} ·{' '}
            {t('pressed-by-you', { defaultValue: 'Pressed by you' })}
          </div>
          <h2 className="slice-display slice-results__title">
            {failedTitle ?? songTitle ?? t('complete', { defaultValue: 'COMPLETE' })}
          </h2>
          {failedTitle && songTitle && <div className="slice-serif text-2xl">{songTitle}</div>}
          {isUnranked && (
            <div className="slice-label mt-3 text-slice-accent">
              {t('unranked', { defaultValue: 'Unranked' })} ·{' '}
              {t('speed-below', { defaultValue: 'Speed below 1.0x' })}
            </div>
          )}
          {/* Full-combo and all-marvellous lamps, in the genre's escalation. */}
          {stats && stats.notesResolved > 0 && (stats.isFullCombo || stats.isPerfect) && (
            <div className="slice-label mt-3 text-slice-primary">
              {stats.isPerfect
                ? ts('lamp-perfect', { defaultValue: 'Perfect' })
                : ts('lamp-full-combo', { defaultValue: 'Full Combo' })}
            </div>
          )}
          {stats?.gaugeBroken && !stats.failed && (
            <div className="slice-label mt-3">
              {ts('gauge-bonus-lost', { defaultValue: 'Gauge broke — bonus forfeited' })}
            </div>
          )}

          <div className="slice-results__score">
            <div className="slice-label">{t('final-score', { defaultValue: 'Final Score' })}</div>
            <div className="slice-results__figure">{score.toLocaleString()}</div>
            {bestDelta !== null ? (
              <div
                className={`slice-figure text-sm ${bestDelta > 0 ? 'text-slice-primary' : 'text-slice-text-muted'}`}
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
            ) : (
              previousBest !== null && (
                <div className="slice-figure text-sm text-slice-text-muted">
                  {t('previous-best', {
                    defaultValue: 'Best: {{score}}',
                    score: previousBest.toLocaleString(),
                  })}
                </div>
              )
            )}
          </div>

          {/* The tally, as dotted leaders: judgement, dots, count. */}
          <dl className="slice-results__tally">
            {stats &&
              stats.notesResolved > 0 &&
              JUDGEMENT_ORDER.map((judgement) => (
                <div key={judgement} className="slice-leader">
                  <dt>{judgement}</dt>
                  <i aria-hidden />
                  <dd
                    className={
                      judgement === 'MARVELOUS' || judgement === 'PERFECT'
                        ? 'text-slice-primary'
                        : judgement === 'MISS' && stats.judgements[judgement] > 0
                          ? 'text-slice-accent'
                          : undefined
                    }
                  >
                    {stats.judgements[judgement]}
                  </dd>
                </div>
              ))}
            <div className="slice-leader">
              <dt>{t('max-chain', { defaultValue: 'Max Chain' })}</dt>
              <i aria-hidden />
              <dd>{maxCombo > 0 ? `${maxCombo}×` : '--'}</dd>
            </div>
            <div className="slice-leader">
              <dt>{t('accuracy', { defaultValue: 'Accuracy' })}</dt>
              <i aria-hidden />
              <dd>{accuracyPct}%</dd>
            </div>
            <div className="slice-leader">
              <dt>{t('speed', { defaultValue: 'Speed' })}</dt>
              <i aria-hidden />
              <dd className="text-slice-text-muted">{multiplier.toFixed(1)}×</dd>
            </div>
          </dl>

          {/* Timing distribution.
              Unstable rate is stdDev x 10 by convention (osu!), which puts a
              typical run in the 60–200 range instead of 6–20 — a scale players
              in this genre already read. */}
          {timing && timing.samples > 0 && (
            <div className="slice-results__timing">
              <dl className="slice-results__timing-list">
                <dt>{ts('unstable-rate', { defaultValue: 'Unstable rate' })}</dt>
                <dd>{(timing.stdDevMs * 10).toFixed(0)}</dd>
                <dt>{ts('timing-bias', { defaultValue: 'Bias' })}</dt>
                <dd>
                  {Math.abs(timing.meanMs).toFixed(1)} ms{' '}
                  {timing.meanMs < 0
                    ? ts('timing-early', { defaultValue: 'early' })
                    : ts('timing-late', { defaultValue: 'late' })}
                </dd>
              </dl>

              {/* One-tap calibration. The measurement already exists — it is
                  submitted with every score for the integrity check — so the only
                  thing standing between the player and a correct offset was
                  nobody offering it to them. */}
              {suggestedOffset !== null && (
                <Button
                  variant="ghost"
                  className="slice-btn-alt mt-3 h-auto w-full whitespace-normal py-2.5 text-[11px] normal-case tracking-normal"
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

          <div className="slice-results__actions">
            <Button className="slice-btn-primary" onClick={onRetry}>
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
            <Button className="slice-btn-alt" onClick={resetRun}>
              {t('menu', { defaultValue: 'Menu' })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
