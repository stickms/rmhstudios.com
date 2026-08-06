'use client';

/**
 * S1 — the daily challenge panel.
 *
 * One song, one difficulty, one modifier set, one attempt, one board that
 * resets at midnight UTC. Everything shown here is derived server-side from the
 * day key (`lib/slice-it/daily.server.ts`); this component never picks anything.
 *
 * ## The two things worth reading before editing
 *
 * **The attempt is spent by the database, not by this file.** The Play button
 * disables itself once `entry` is present, but that is a courtesy — the actual
 * rule is `@@unique([dayKey, userId])`, and the submit route answers 409 when it
 * fires. A second tab that never saw the first attempt still cannot file one.
 *
 * **The run outcome is collected by `runTracker`, not by an effect here.**
 * `MainMenu` unmounts the moment a run starts, so this panel is not alive when
 * the run it started ends. `armRunFinish` keeps the handler outside React; see
 * that module's header.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CalendarDays, Loader2, Trophy } from 'lucide-react';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { GameEngine } from '@/lib/slice-it/engine';
import type { DailyState } from '@/lib/slice-it/daily.server';
import { armRunFinish } from './runTracker';

interface DailyPanelProps {
  engine: GameEngine | null;
  /** Loads the song and starts the run — `MainMenu`'s `startRun`. */
  onPlay: (songId: string) => Promise<void>;
  onBack: () => void;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DailyPanel({ engine, onPlay, onBack }: DailyPanelProps) {
  const { t } = useTranslation('r-slice-it');
  const [state, setState] = React.useState<DailyState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState(0);
  const setModifiers = useSliceItStore((s) => s.setModifiers);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/slice-it/daily');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as DailyState;
      setState(data);
      setRemaining(data.resetsInMs);
      setError(null);
    } catch {
      setError(t('daily-load-failed', { defaultValue: 'Could not load the daily challenge.' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Local countdown off the server's `resetsInMs`, so a client with a wrong
  // clock still counts down to the right instant.
  React.useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((ms) => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(id);
  }, [remaining > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const selection = state?.selection ?? null;
  const alreadyPlayed = Boolean(state?.entry);

  const play = React.useCallback(async () => {
    if (!selection || !engine || alreadyPlayed) return;

    // The daily's modifiers replace the player's for exactly one run. Snapshot
    // theirs first: the store is persisted, so leaving the daily's set in place
    // would silently rewrite their settings for every song afterwards.
    const restore = useSliceItStore.getState().modifiers;
    setModifiers(selection.modifiers);

    armRunFinish(engine, (stats) => {
      useSliceItStore.getState().setModifiers(restore);
      void fetch('/api/slice-it/daily/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: selection.songId,
          score: Math.max(0, Math.round(stats.score)),
          accuracy: Math.max(0, Math.min(100, stats.accuracy)),
          maxCombo: Math.max(0, Math.round(stats.maxCombo)),
          cleared: !stats.failed,
        }),
      }).catch(() => {});
    });

    await onPlay(selection.songId).catch(() => {
      // The run never started, so nothing was spent — put their settings back.
      useSliceItStore.getState().setModifiers(restore);
    });
  }, [selection, engine, alreadyPlayed, onPlay, setModifiers]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-4 sm:p-6 gap-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-slice-text-muted hover:text-slice-text rounded-lg font-black uppercase tracking-wide text-xs"
        >
          {t('back', { defaultValue: 'Back' })}
        </Button>
        <h2 className="flex items-center gap-2 text-lg sm:text-xl font-black uppercase tracking-tight text-slice-text">
          <CalendarDays className="w-5 h-5" />
          {t('daily-challenge', { defaultValue: 'Daily Challenge' })}
        </h2>
        <span className="ml-auto text-xs font-black tabular-nums text-slice-text-muted uppercase tracking-widest">
          {t('daily-resets-in', { defaultValue: 'Resets in' })} {formatCountdown(remaining)}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slice-text-muted font-bold uppercase text-xs tracking-widest">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('loading', { defaultValue: 'Loading' })}
        </div>
      )}

      {error && <p className="neumorphic-inset rounded-2xl p-4 text-sm font-bold">{error}</p>}

      {!loading && !error && !selection && (
        <p className="neumorphic-inset rounded-2xl p-4 text-sm font-bold text-slice-text-muted">
          {t('daily-none', {
            defaultValue:
              'No daily challenge yet — the library needs more well-played charts before one can be chosen.',
          })}
        </p>
      )}

      {selection && (
        <div className="neumorphic rounded-3xl p-5 flex flex-col sm:flex-row gap-5 items-start">
          {selection.coverUrl ? (
            <img
              src={selection.coverUrl}
              alt=""
              className="w-24 h-24 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl neumorphic-inset shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-slice-text-muted">
              {selection.dayKey}
            </div>
            <div className="text-xl font-black text-slice-text truncate">{selection.title}</div>
            <div className="text-sm font-bold text-slice-text-muted truncate">
              {selection.artist}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="neumorphic-inset rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slice-text-muted">
                {selection.difficulty}
              </span>
              <span className="neumorphic-inset rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slice-text-muted">
                {t('daily-gauge-on', { defaultValue: 'Health gauge on' })}
              </span>
              <span className="neumorphic-inset rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slice-text-muted">
                {t('daily-one-attempt', { defaultValue: 'One attempt' })}
              </span>
            </div>
          </div>
          <Button
            onClick={() => void play()}
            disabled={alreadyPlayed || !engine}
            className="neumorphic rounded-2xl px-6 py-5 font-black uppercase tracking-widest text-slice-text disabled:opacity-50"
          >
            {alreadyPlayed
              ? t('daily-spent', { defaultValue: 'Attempt used' })
              : t('daily-play', { defaultValue: 'Play' })}
          </Button>
        </div>
      )}

      {state?.entry && (
        <div className="neumorphic-inset rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slice-text-muted">
            {t('daily-your-run', { defaultValue: 'Your run' })}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-4 font-black text-slice-text">
            <span className="text-2xl tabular-nums">{state.entry.score.toLocaleString()}</span>
            <span className="text-sm tabular-nums text-slice-text-muted">
              {state.entry.accuracy.toFixed(2)}%
            </span>
            <span className="text-sm tabular-nums text-slice-text-muted">
              x{state.entry.maxCombo}
            </span>
            {state.myRank !== null && (
              <span className="text-sm text-slice-text-muted uppercase tracking-widest">
                #{state.myRank}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="neumorphic rounded-3xl p-4 min-h-0">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slice-text mb-3">
          <Trophy className="w-4 h-4" />
          {t('daily-board', { defaultValue: "Today's Board" })}
        </h3>
        {state && state.board.length === 0 ? (
          <p className="text-xs font-bold uppercase tracking-widest text-slice-text-muted">
            {t('daily-board-empty', { defaultValue: 'Nobody has played yet. Go first.' })}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {state?.board.map((row) => (
              <li
                key={row.userId}
                className="flex items-center gap-3 rounded-xl px-3 py-2 neumorphic-inset"
              >
                <span className="w-8 text-xs font-black tabular-nums text-slice-text-muted">
                  #{row.rank}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-bold text-slice-text">
                  {row.name}
                </span>
                {!row.cleared && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-slice-text-muted">
                    {t('daily-failed', { defaultValue: 'Failed' })}
                  </span>
                )}
                <span className="text-sm font-black tabular-nums text-slice-text">
                  {row.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
