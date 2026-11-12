import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSliceItStore } from '@features/slice-it/engine/store';
import { AudioManager } from '@/lib/audio/AudioManager';
import type { GameEngine } from '@features/slice-it/engine/engine';
import { HEALTH_MAX } from '@features/slice-it/engine/constants';
import { gradeFor } from '@features/slice-it/engine/scoring';
import type { BeatMap } from '@features/slice-it/engine/types';
import type { Section } from '@features/slice-it/engine/beatmap/sections';

/**
 * H5 — a stored chart's `analysisData` is a `GeneratedBeatmap` (see
 * `features/slice-it/engine/beatmap/index.ts`), which carries `artefacts.sections` — but
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

/**
 * H9 — where the combo counter anchors inside the score/speed row.
 *
 * `hidden` maps to the centre classes and is never rendered; keeping it in the
 * record means the lookup is total, so the anchor cannot be `undefined` for a
 * value the store is allowed to hold.
 */
const COMBO_ANCHOR: Record<'center' | 'left' | 'right' | 'hidden', string> = {
  center: 'left-1/2 -translate-x-1/2',
  left: 'left-0',
  right: 'right-0',
  hidden: 'left-1/2 -translate-x-1/2',
};

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
  /**
   * The readouts live in the margins of the screen (`MarginHud`), so this renders
   * only what belongs on the field itself: the combo counter. It also stops sampling
   * the engine — the margin HUD does that — so nothing is read twice.
   */
  margins?: boolean;
}

/**
 * What the readouts show, sampled from the engine once a frame.
 *
 * One hook for both homes of the readouts — the in-field {@link HUD} and the
 * margin HUD — so they cannot disagree about what a grade or a progress fraction is.
 * `enabled: false` stops the per-frame sampling (it is the only cost).
 */
export function useHudReadout(engine: GameEngine | null | undefined, enabled = true) {
  const { score, combo, modifiers } = useSliceItStore();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sample, setSample] = useState<EngineSample>(EMPTY_SAMPLE);

  useEffect(() => {
    if (!enabled) return;
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
  }, [engine, enabled]);

  // Clamped at both ends. The clock is NEGATIVE through the lead-in
  // (`LEAD_IN_SECONDS`), which would otherwise render a negative-width fill and
  // a `0:-3` elapsed readout for the first few seconds of every run.
  const elapsed = Math.max(0, currentTime);
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // H5 — section markers on the progress bar. `getActiveMap()` returns the
  // same object reference for the whole run (a new one only arrives with a
  // new song via `loadMap`), so this only recomputes when it actually
  // changes rather than on every one of the frame ticks above.
  const activeMap = engine?.getActiveMap() as MapWithSections | null | undefined;
  const sections = useMemo(() => activeMap?.artefacts?.sections ?? NO_SECTIONS, [activeMap]);

  const grade = gradeFor(sample.accuracy);

  // Only news once the run has produced something to be full-combo *about*.
  const showChain = sample.notesResolved >= 8 && sample.isFullCombo;
  const healthRatio = Math.max(0, Math.min(1, sample.health / HEALTH_MAX));

  return {
    score,
    combo,
    modifiers,
    elapsed,
    duration,
    progress,
    sections,
    sample,
    grade,
    showChain,
    healthRatio,
  };
}

export function HUD({ engine, margins = false }: HUDProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const comboPosition = useSliceItStore((s) => s.comboPosition);
  const {
    score,
    combo,
    modifiers,
    elapsed,
    duration,
    progress,
    sections,
    sample,
    grade,
    showChain,
    healthRatio,
  } = useHudReadout(engine, !margins);

  // The readouts are in the margins: the field keeps only the combo, where the eye
  // is, and nothing else to read.
  if (margins) {
    if (combo <= 5 || comboPosition === 'hidden') return null;
    return (
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-40 px-3 pt-2 sm:px-6 sm:pt-3"
      >
        <div className="relative">
          <div className={`absolute top-0 text-center ${COMBO_ANCHOR[comboPosition]}`}>
            <div className="slice-hud-combo">
              <span>×</span>
              {combo}
            </div>
            <div className="slice-label mt-0.5 hidden sm:block">
              {t('combo-label', { defaultValue: 'Combo' })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute top-0 left-0 right-0 pointer-events-none z-40 px-3 pt-2 sm:px-6 sm:pt-3 flex flex-col gap-2"
    >
      {/* Song progress: the groove, with a needle where the record is. A normal
          child of the HUD column, not `absolute bottom-0 translate-y-full`:
          hanging it below a box whose height grows with the score stack meant
          every extra line up there pushed the bar further down until it landed
          on the first lane and clipped the notes. */}
      {duration > 0 && (
        <div className="pointer-events-none pr-11 sm:pr-12">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="slice-label w-10 text-right shrink-0">{fmt(elapsed)}</span>
            <div className="slice-hud-groove">
              {/* H5 — section boundaries. Skipped at `start <= 0`: the first
                  section always begins at the groove's own left edge. */}
              {sections
                .filter((s) => s.start > 0)
                .map((s) => (
                  <span
                    key={s.start}
                    className="slice-hud-groove__tick"
                    style={{ left: `${Math.min(100, (s.start / duration) * 100)}%` }}
                  />
                ))}
              <div className="slice-hud-groove__fill" style={{ width: `${progress * 100}%` }} />
              <div className="slice-hud-groove__needle" style={{ left: `${progress * 100}%` }} />
            </div>
            <span className="slice-label w-10 shrink-0">{fmt(duration)}</span>
          </div>
        </div>
      )}

      {/* Score + Speed row */}
      <div className="flex justify-between items-start relative">
        <div className="flex flex-col gap-1.5 items-start">
          <div>
            <div className="flex items-center gap-3 sm:gap-5">
              <span className="slice-hud-score">{score.toLocaleString()}</span>
              {/* The grade rides with the score: it is the headline the player
                  glances at, stamped beside the number it summarises. */}
              {engine && <span className="slice-hud-stamp">{grade}</span>}
            </div>
          </div>

          {/* Live accuracy. */}
          {engine && (
            <span className="slice-figure text-[13px] text-slice-text">
              {(sample.accuracy * 100).toFixed(2)}%
            </span>
          )}
        </div>

        {/* Speed — shifted left to avoid the settings gear */}
        <div className="text-right mr-10 sm:mr-12">
          <div className="slice-figure text-xl sm:text-3xl font-medium text-slice-text leading-none">
            {modifiers.speed.toFixed(1)}×
          </div>
        </div>

        {/* Combo — H9 puts it where the player asked. `hidden` is a real choice,
            not an accident: at speed the counter sits directly over the approach
            lane, and some players would rather read the notes. */}
        {combo > 5 && comboPosition !== 'hidden' && (
          <div className={`absolute top-0 sm:top-1 text-center ${COMBO_ANCHOR[comboPosition]}`}>
            <div className="slice-hud-combo">
              <span>×</span>
              {combo}
            </div>
            <div className="slice-label mt-0.5 hidden sm:block">
              {t('combo-label', { defaultValue: 'Combo' })}
            </div>
          </div>
        )}

        {/* Full-combo / all-marvellous lamp. Tracks the combo counter's own
            anchor so the two still read as one column wherever it has been moved
            to, and disappears the instant it stops being true — which is the
            feedback. */}
        {showChain && (
          <div
            className={`absolute top-16 sm:top-[8.5rem] flex flex-col items-center ${COMBO_ANCHOR[comboPosition]}`}
          >
            <span
              className={`slice-label ${sample.isPerfect ? 'text-slice-primary' : 'text-slice-text-muted'}`}
            >
              {sample.isPerfect
                ? ts('lamp-perfect', { defaultValue: 'Perfect' })
                : ts('lamp-full-combo', { defaultValue: 'Full Combo' })}
            </span>
          </div>
        )}
      </div>

      {/* Health gauge — only when the run opted into it. An always-present bar
          pinned at 100% would be chrome that means nothing; here its presence IS
          the signal that this run can end early. */}
      {modifiers.healthGauge && (
        <div className="flex items-center gap-2">
          <span className="slice-label shrink-0">
            {sample.gaugeBroken
              ? ts('gauge-broken', { defaultValue: 'Gauge broken' })
              : ts('gauge', { defaultValue: 'Gauge' })}
          </span>
          <div className="slice-hud-groove">
            <div
              className={`h-full origin-left transition-transform duration-150 ${
                sample.gaugeBroken
                  ? 'bg-slice-text-light'
                  : healthRatio < 0.5
                    ? 'bg-slice-accent'
                    : 'bg-slice-primary'
              }`}
              // `scaleX` rather than `width`: a bar that moves every judgement is
              // a bar that would reflow the HUD every judgement.
              style={{ width: '100%', transform: `scaleX(${healthRatio})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
