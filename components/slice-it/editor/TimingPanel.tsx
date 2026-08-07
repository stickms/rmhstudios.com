'use client';

/**
 * Timing points and scroll velocity — §4.2, ideas `C6` / `G10`, phase 8.
 *
 * Two lists, both anchored to the playhead: you scrub to the bar where the
 * tempo changes and press Add, rather than typing a timestamp you have to
 * compute. That is the only interaction model that works, because a timing
 * point is only ever correct relative to something you are listening to.
 *
 * The multiplier field is a number input rather than a slider: SV values are
 * chosen (0.5, 2), not explored, and a slider makes the common case — typing
 * "0.5" — the hard one.
 */

import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/lib/slice-it/editor/store';
import { MAX_SV, MIN_SV, withSvPoint, withoutSvPoint } from '@/lib/slice-it/editor/sv';
import type { TimingPoint } from '@/lib/slice-it/editor/types';
import { formatTime } from './Timeline';

export function TimingPanel() {
  const { t } = useTranslation('r-slice-it');
  const timingPoints = useEditorStore((s) => s.timingPoints);
  const svPoints = useEditorStore((s) => s.svPoints);
  const setTimingPoints = useEditorStore((s) => s.setTimingPoints);
  const setSvPoints = useEditorStore((s) => s.setSvPoints);
  const playhead = useEditorStore((s) => s.playhead);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);

  const addTiming = () => {
    const previous = [...timingPoints].reverse().find((point) => point.time <= playhead);
    const next: TimingPoint = {
      time: playhead,
      bpm: previous?.bpm ?? 120,
      meter: previous?.meter ?? 4,
    };
    setTimingPoints(
      [...timingPoints.filter((point) => Math.abs(point.time - playhead) > 1e-3), next].sort(
        (a, b) => a.time - b.time,
      ),
    );
  };

  const editTiming = (index: number, patch: Partial<TimingPoint>) => {
    setTimingPoints(timingPoints.map((point, i) => (i === index ? { ...point, ...patch } : point)));
  };

  return (
    <section
      className="neumorphic flex flex-col gap-3 p-4"
      aria-label={t('editor-timing-title', { defaultValue: 'Timing' })}
    >
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">
          {t('editor-timing-title', { defaultValue: 'Timing' })}
        </h2>
        <button
          type="button"
          onClick={addTiming}
          className="neumorphic-sm ml-auto flex h-7 items-center gap-1 px-2 text-xs"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('editor-timing-add', { defaultValue: 'At playhead' })}
        </button>
      </header>

      <ul className="flex flex-col gap-1.5">
        {timingPoints.map((point, index) => (
          <li
            key={`${point.time}-${index}`}
            className="neumorphic-inset flex items-center gap-2 px-2 py-1.5"
          >
            <button
              type="button"
              onClick={() => setPlayhead(point.time)}
              className="font-mono text-xs tabular-nums opacity-80"
              title={t('editor-timing-seek', { defaultValue: 'Seek here' })}
            >
              {formatTime(point.time)}
            </button>
            <label className="sr-only" htmlFor={`slice-bpm-${index}`}>
              {t('editor-timing-bpm', { defaultValue: 'BPM' })}
            </label>
            <Input
              id={`slice-bpm-${index}`}
              type="number"
              inputMode="decimal"
              min={20}
              max={400}
              step={0.01}
              value={point.bpm}
              onChange={(event) => editTiming(index, { bpm: Number(event.target.value) })}
              className="h-7 w-20 text-xs"
            />
            <label className="sr-only" htmlFor={`slice-meter-${index}`}>
              {t('editor-timing-meter', { defaultValue: 'Beats per bar' })}
            </label>
            <Input
              id={`slice-meter-${index}`}
              type="number"
              min={1}
              max={16}
              step={1}
              value={point.meter}
              onChange={(event) => editTiming(index, { meter: Number(event.target.value) })}
              className="h-7 w-14 text-xs"
            />
            {/* The first point is the song's own tempo and every bar number is
                counted from it, so it can be edited but never removed. */}
            {index > 0 && (
              <button
                type="button"
                onClick={() => setTimingPoints(timingPoints.filter((_, i) => i !== index))}
                className="ml-auto opacity-60 hover:opacity-100"
                aria-label={t('editor-timing-remove', { defaultValue: 'Remove timing point' })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {t('editor-sv-title', { defaultValue: 'Scroll velocity' })}
        </h3>
        <button
          type="button"
          onClick={() => setSvPoints(withSvPoint(svPoints, { time: playhead, multiplier: 1 }))}
          className="neumorphic-sm ml-auto flex h-7 items-center gap-1 px-2 text-xs"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('editor-timing-add', { defaultValue: 'At playhead' })}
        </button>
      </header>

      {svPoints.length === 0 ? (
        <p className="text-xs opacity-70">
          {t('editor-sv-empty', { defaultValue: 'Notes scroll at a constant speed.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {svPoints.map((point, index) => (
            <li
              key={`${point.time}-${index}`}
              className="neumorphic-inset flex items-center gap-2 px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() => setPlayhead(point.time)}
                className="font-mono text-xs tabular-nums opacity-80"
                title={t('editor-timing-seek', { defaultValue: 'Seek here' })}
              >
                {formatTime(point.time)}
              </button>
              <label className="sr-only" htmlFor={`slice-sv-${index}`}>
                {t('editor-sv-multiplier', { defaultValue: 'Multiplier' })}
              </label>
              <Input
                id={`slice-sv-${index}`}
                type="number"
                inputMode="decimal"
                min={MIN_SV}
                max={MAX_SV}
                step={0.1}
                value={point.multiplier}
                onChange={(event) =>
                  setSvPoints(
                    withSvPoint(svPoints, {
                      time: point.time,
                      multiplier: Number(event.target.value),
                    }),
                  )
                }
                className="h-7 w-20 text-xs"
              />
              <span className="text-xs opacity-60">×</span>
              <button
                type="button"
                onClick={() => setSvPoints(withoutSvPoint(svPoints, point.time))}
                className="ml-auto opacity-60 hover:opacity-100"
                aria-label={t('editor-sv-remove', { defaultValue: 'Remove SV point' })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
