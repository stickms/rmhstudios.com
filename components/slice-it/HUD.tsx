'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSliceItStore } from '@/lib/slice-it/store';
import { AudioManager } from '@/lib/audio/AudioManager';
import type { GameEngine } from '@/lib/slice-it/engine';
import { HEALTH_MAX } from '@/lib/slice-it/constants';
import { gradeFor, missesAllowedFor, nextGradeAbove } from '@/lib/slice-it/scoring';
import type { BeatMap } from '@/lib/slice-it/types';
import type { Section } from '@/lib/slice-it/beatmap/sections';

/**
 * H5 — a stored chart's `analysisData` is a `GeneratedBeatmap` (see
 * `lib/slice-it/beatmap/index.ts`), which carries `artefacts.sections` — but
 * `engine.getActiveMap()` is typed as the plainer `BeatMap` that every caller
 * without a reason to know better should see. This is that reason, declared
 * locally rather than by editing `types.ts` (not owned by this change): the
 * shape the engine actually holds, for the one place that needs the extra
 * field.
 */
interface MapWithSections extends BeatMap {
  artefacts?: { sections?: Section[] };
}

/** Stable empty reference so a songless HUD render never allocates a new array. */
const NO_SECTIONS: Section[] = [];

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * What the HUD samples from the engine each frame.
 *
 * Read off the engine rather than the store because three of the five are not in
 * the store and should not be: `hitPoints`/`totalNotes` are the accuracy
 * *fraction*, not the ratio, and pushing them through zustand would re-render
 * every subscriber in the game sixty times a second to feed one label.
 */
interface EngineSample {
  accuracy: number;
  hitPoints: number;
  notesResolved: number;
  totalNotes: number;
  health: number;
  gaugeBroken: boolean;
  isFullCombo: boolean;
  isPerfect: boolean;
}

const EMPTY_SAMPLE: EngineSample = {
  accuracy: 0,
  hitPoints: 0,
  notesResolved: 0,
  totalNotes: 0,
  health: HEALTH_MAX,
  gaugeBroken: false,
  isFullCombo: true,
  isPerfect: false,
};

interface HUDProps {
  /**
   * The running engine. Optional so the HUD still renders (without the accuracy
   * pace readout) if it is mounted before one exists.
   */
  engine?: GameEngine | null;
}

export function HUD({ engine }: HUDProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const { score, combo, modifiers } = useSliceItStore();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sample, setSample] = useState<EngineSample>(EMPTY_SAMPLE);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const audio = AudioManager.getInstance();
      setCurrentTime(audio.getCurrentTime());
      setDuration(audio.getDuration());
      if (engine) {
        const state = engine.getState();
        setSample({
          accuracy: state.accuracy,
          hitPoints: state.hitPoints,
          notesResolved: state.notesResolved,
          totalNotes: state.totalNotes,
          health: state.health,
          gaugeBroken: state.gaugeBroken,
          isFullCombo: state.isFullCombo,
          isPerfect: state.isPerfect,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // H5 — section markers on the progress bar. `getActiveMap()` returns the
  // same object reference for the whole run (a new one only arrives with a
  // new song via `loadMap`), so this only recomputes when it actually
  // changes rather than on every one of the frame ticks above.
  const activeMap = engine?.getActiveMap() as MapWithSections | null | undefined;
  const sections = useMemo(() => activeMap?.artefacts?.sections ?? NO_SECTIONS, [activeMap]);

  const grade = gradeFor(sample.accuracy);
  const next = nextGradeAbove(sample.accuracy);
  const missesLeft = next
    ? missesAllowedFor(sample.hitPoints, sample.notesResolved, sample.totalNotes, next.min)
    : null;

  // Only news once the run has produced something to be full-combo *about*.
  const showChain = sample.notesResolved >= 8 && sample.isFullCombo;
  const healthRatio = Math.max(0, Math.min(1, sample.health / HEALTH_MAX));

  return (
    <div className="absolute top-0 left-0 right-0 pointer-events-none z-40 p-2 sm:p-4 flex flex-col gap-2 font-outfit">
      {/* Score + Speed row */}
      <div className="flex justify-between items-start relative px-1">
        <div className="flex flex-col gap-2 items-start">
          <div className="bg-slice-bg shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] rounded-2xl px-4 py-2">
            <div className="text-[10px] sm:text-xs text-slice-text-muted uppercase tracking-wider font-bold leading-none mb-1">
              {t('score', { defaultValue: 'Score' })}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slice-text leading-tight">
              {score.toLocaleString()}
            </div>
          </div>

          {/* Live accuracy, live grade, and what it costs to keep the next one.
              The engine has tracked accuracy continuously since it existed and
              the grade is defined purely by it, so a player used to find out
              which grade they were on course for at the results screen. */}
          {engine && (
            <div className="bg-slice-bg shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] rounded-2xl px-3 py-1.5 min-w-28">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm sm:text-base font-bold text-slice-text tabular-nums">
                  {(sample.accuracy * 100).toFixed(2)}%
                </span>
                <span className="text-base sm:text-lg font-black text-slice-text-darker soft-glow-text ml-auto">
                  {grade}
                </span>
              </div>
              {next && missesLeft !== null && (
                <div className="text-[9px] sm:text-[10px] text-slice-text-light font-bold uppercase tracking-wider leading-tight">
                  {ts('misses-for-grade', {
                    defaultValue: '{{n}} misses left for {{grade}}',
                    n: missesLeft,
                    grade: next.grade,
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Speed row — shifted left to avoid settings gear overlap */}
        <div className="bg-slice-bg shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] rounded-2xl px-4 py-2 text-right mr-10 sm:mr-12">
          <div className="text-[10px] sm:text-xs text-slice-text-muted uppercase tracking-wider font-bold leading-none mb-1">
            {t('speed', { defaultValue: 'Speed' })}
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slice-text leading-tight">
            {modifiers.speed.toFixed(1)}x
          </div>
        </div>

        {/* Combo — center, above score/speed row */}
        {combo > 5 && (
          <div
            key={combo}
            className="absolute left-1/2 -translate-x-1/2 top-1 sm:top-2"
            style={{ animation: 'combo-bounce 0.15s ease-out' }}
          >
            <span className="text-3xl sm:text-5xl font-black italic text-slice-text soft-glow-text drop-shadow-lg">
              {combo}x
            </span>
          </div>
        )}

        {/* Full-combo / all-marvellous lamp. Sits under the combo counter so the
            two read as one column, and disappears the instant it stops being
            true — which is the feedback. */}
        {showChain && (
          <div className="absolute left-1/2 -translate-x-1/2 top-12 sm:top-16 flex flex-col items-center">
            <span
              className={`text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] ${
                sample.isPerfect ? 'text-cyan-500' : 'text-slice-text-muted'
              }`}
            >
              {sample.isPerfect
                ? ts('lamp-perfect', { defaultValue: 'Perfect' })
                : ts('lamp-full-combo', { defaultValue: 'Full Combo' })}
            </span>
          </div>
        )}
      </div>

      {/* Health gauge — only when the run opted into it. An always-present bar
          pinned at 100% would be chrome that means nothing; here its presence
          IS the signal that this run can end early. */}
      {modifiers.healthGauge && (
        <div className="px-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slice-text-light shrink-0">
              {sample.gaugeBroken
                ? ts('gauge-broken', { defaultValue: 'Gauge broken' })
                : ts('gauge', { defaultValue: 'Gauge' })}
            </span>
            <div className="flex-1 h-2 bg-slice-bg rounded-full overflow-hidden shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]">
              <div
                className={`h-full origin-left rounded-full transition-transform duration-150 ${
                  sample.gaugeBroken
                    ? 'bg-slice-text-light'
                    : healthRatio < 0.25
                      ? 'bg-red-500'
                      : healthRatio < 0.5
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                }`}
                // `scaleX` rather than `width`: a bar that moves every judgement
                // is a bar that would reflow the HUD every judgement.
                style={{ width: '100%', transform: `scaleX(${healthRatio})` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Song progress bar — bottom of HUD */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 translate-y-full pt-2 px-4 pointer-events-none">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slice-text-muted w-10 text-right shrink-0">
              {fmt(currentTime)}
            </span>
            <div className="relative flex-1 h-2 bg-slice-bg rounded-full overflow-hidden shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]">
              {/* H5 — section boundaries. Skipped at `start <= 0`: the first
                  section always begins at the bar's own left edge, where a
                  tick would just double the bar's rounded corner. */}
              {duration > 0 &&
                sections
                  .filter((s) => s.start > 0)
                  .map((s) => (
                    <span
                      key={s.start}
                      className="absolute top-0 h-full w-px bg-slice-shadow-dark/60"
                      style={{ left: `${Math.min(100, (s.start / duration) * 100)}%` }}
                    />
                  ))}
              <div
                className="h-full bg-blue-400 rounded-full transition-none"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slice-text-muted w-10 shrink-0">
              {fmt(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
