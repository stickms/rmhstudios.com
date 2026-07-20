/**
 * Shared read-only replay player chrome (platform expansion §7).
 *
 * Drives a per-game, read-only renderer from a `(seed, inputs)` log with
 * play / pause / scrub / speed controls. Games whose pure logic is importable
 * get a faithful renderer (Lights Out reconstructs the actual board); everything
 * else falls back to a version-agnostic timeline of the input log.
 *
 * A replay recorded on an older logic `version` than the one currently
 * registered can't be guaranteed to render faithfully, so it shows a
 * version-mismatch notice and downgrades to the generic timeline.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ReplayData } from '@/lib/game/replay';
import { lightsOutInitialGrid } from '@/lib/game/replay';
import { toggleCellInGrid, type Grid } from '@/lib/lights-out/lights-out';
import { isActiveCell, type GridShape } from '@/lib/lights-out/shapes';

export interface GameReplayPlayerProps {
  game: string;
  version: string;
  currentVersion: string | null;
  versionMatch: boolean;
  data: ReplayData;
  score: number | null;
  durationMs: number;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export function GameReplayPlayer({
  game,
  version,
  versionMatch,
  data,
  score,
  durationMs,
}: GameReplayPlayerProps) {
  const { t } = useTranslation('site');
  const inputs = useMemo(() => (Array.isArray(data.inputs) ? data.inputs : []), [data.inputs]);
  const total = inputs.length;

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cadence: spread the run over its recorded duration, clamped so it's neither
  // a blur nor a slideshow. Falls back to a fixed tick when duration is unknown.
  const baseCadence = useMemo(() => {
    if (durationMs > 0 && total > 0) {
      return Math.min(1500, Math.max(120, Math.round(durationMs / total)));
    }
    return 500;
  }, [durationMs, total]);

  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setStep((s) => Math.min(total, s + 1)), baseCadence / speed);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, step, total, baseCadence, speed]);

  const atEnd = step >= total;
  const canRenderGame = versionMatch && game === 'lights-out';

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {!versionMatch && (
        <div className="w-full max-w-md rounded-site border border-site-border bg-site-surface px-4 py-3 text-center text-sm text-site-text-muted">
          {t('replay-version-mismatch', {
            defaultValue:
              'This replay was recorded on an older version of the game. Showing a simplified timeline.',
          })}{' '}
          <span className="text-site-text-dim">({version})</span>
        </div>
      )}

      {/* Stage */}
      <div className="flex min-h-[280px] w-full items-center justify-center rounded-site border border-site-border bg-site-surface p-6">
        {total === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('replay-empty', { defaultValue: 'This replay has no recorded moves.' })}
          </p>
        ) : canRenderGame ? (
          <LightsOutStage data={data} step={step} />
        ) : (
          <GenericTimeline inputs={inputs} step={step} />
        )}
      </div>

      {/* Scrubber */}
      <div className="w-full">
        <input
          type="range"
          min={0}
          max={total}
          value={step}
          onChange={(e) => {
            setPlaying(false);
            setStep(Number(e.target.value));
          }}
          aria-label={t('replay-scrubber', { defaultValue: 'Replay position' })}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-site-bg accent-site-accent"
          disabled={total === 0}
        />
        <div className="mt-1 flex justify-between text-xs text-site-text-dim">
          <span>
            {t('replay-move', { defaultValue: 'Move' })} {step} / {total}
          </span>
          {score != null && (
            <span>
              {t('replay-score', { defaultValue: 'Score' })}: {score}
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
          aria-label={t('replay-restart', { defaultValue: 'Restart' })}
        >
          <RotateCcw aria-hidden />
        </Button>

        <Button
          variant="accent"
          onClick={() => {
            if (atEnd) setStep(0);
            setPlaying((p) => !p);
          }}
          disabled={total === 0}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          {playing
            ? t('replay-pause', { defaultValue: 'Pause' })
            : atEnd
              ? t('replay-replay', { defaultValue: 'Replay' })
              : t('replay-play', { defaultValue: 'Play' })}
        </Button>

        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            setPlaying(false);
            setStep(total);
          }}
          aria-label={t('replay-skip-end', { defaultValue: 'Skip to end' })}
        >
          <SkipForward aria-hidden />
        </Button>

        <div className="flex items-center gap-1 rounded-full border border-site-border bg-site-surface p-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                speed === s
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'text-site-text-muted hover:bg-site-surface-hover',
              )}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Lights Out — faithful read-only board reconstructed from the seed.
 * ------------------------------------------------------------------ */

function LightsOutStage({ data, step }: { data: ReplayData; step: number }) {
  const { t } = useTranslation('site');
  const seed = typeof data.seed === 'number' ? data.seed : Number(data.seed);
  const moves = useMemo(
    () => (Array.isArray(data.inputs) ? (data.inputs as [number, number][]) : []),
    [data.inputs],
  );

  // The expensive puzzle generation (seed → board) runs once per seed; scrubbing
  // only replays the cheap toggles on top of it.
  const base = useMemo(() => (Number.isFinite(seed) ? lightsOutInitialGrid(seed) : null), [seed]);

  const view = useMemo(() => {
    if (!base) return null;
    let g: Grid = base.grid;
    const n = Math.min(step, moves.length);
    for (let i = 0; i < n; i++) {
      const [r, c] = moves[i];
      g = toggleCellInGrid(g, r, c, base.shape);
    }
    const cur = step > 0 && step <= moves.length ? moves[step - 1] : null;
    return { grid: g, shape: base.shape as GridShape, current: cur };
  }, [base, step, moves]);

  if (!view) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('replay-unrenderable', { defaultValue: 'Unable to reconstruct this board.' })}
      </p>
    );
  }
  const { grid, shape, current } = view;

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      aria-label={t('replay-board', { defaultValue: 'Replay board' })}
    >
      {grid.map((row, r) => (
        <div key={r} className="flex gap-1.5">
          {row.map((cell, c) => {
            if (!isActiveCell(shape, r, c)) {
              return <div key={c} className="h-9 w-9" aria-hidden />;
            }
            const isCurrent = current != null && current[0] === r && current[1] === c;
            return (
              <div
                key={c}
                className={cn(
                  'h-9 w-9 rounded-md border transition-colors',
                  cell
                    ? 'border-site-accent bg-site-accent/80 shadow-[0_0_10px_var(--site-accent)]'
                    : 'border-site-border bg-site-bg',
                  isCurrent && 'ring-2 ring-site-accent ring-offset-2 ring-offset-site-surface',
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Generic timeline — version-agnostic fallback for any input log.
 * ------------------------------------------------------------------ */

function GenericTimeline({ inputs, step }: { inputs: unknown[]; step: number }) {
  const { t } = useTranslation('site');
  // Show a window of events centered on the current position so long logs stay
  // readable.
  const windowStart = Math.max(0, step - 6);
  const windowEnd = Math.min(inputs.length, windowStart + 12);
  const slice = inputs.slice(windowStart, windowEnd);

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <p className="text-center text-xs uppercase tracking-wide text-site-text-dim">
        {t('replay-timeline', { defaultValue: 'Event timeline' })}
      </p>
      <ol className="flex flex-col gap-1">
        {slice.map((event, i) => {
          const index = windowStart + i;
          const active = index === step - 1;
          const played = index < step;
          return (
            <li
              key={index}
              className={cn(
                'flex items-center gap-2 rounded-site border px-3 py-1.5 font-mono text-xs',
                active
                  ? 'border-site-accent bg-site-accent/10 text-site-text'
                  : played
                    ? 'border-site-border bg-site-surface text-site-text-muted'
                    : 'border-site-border/50 bg-transparent text-site-text-dim',
              )}
            >
              <span className="w-8 shrink-0 text-site-text-dim">#{index + 1}</span>
              <span className="truncate">{describeEvent(event)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function describeEvent(event: unknown): string {
  if (Array.isArray(event)) return `[${event.join(', ')}]`;
  if (event && typeof event === 'object') {
    try {
      return JSON.stringify(event).slice(0, 60);
    } catch {
      return '{…}';
    }
  }
  return String(event);
}
