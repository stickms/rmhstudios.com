'use client';

/**
 * Slice It — replay playback (`R4`).
 *
 * ## Playback is the game, not a recording of it
 *
 * There is no video here and nothing is re-implemented. The viewer loads the
 * same `BeatMap` through the same `GameEngine.loadMap`, under the modifiers the
 * replay recorded, and then hands the engine the input log instead of a keyboard
 * — `engine.loadReplay()`. Every resolution goes through the same `resolve()` a
 * live press does, so the score, the combo, the accuracy, the judgement text and
 * the health gauge come out of a replay exactly as they came out of the run.
 * That property is the whole reason to play back through the engine rather than
 * to draw a stored timeline: a second implementation would be a second thing to
 * drift, and the drift would look like the player's run being wrong.
 *
 * ## What it deliberately does not reuse
 *
 * `GameCanvas` is 2 000 lines of *game*: keyboard and pointer binding, pause
 * menus, countdowns, multiplayer chrome, results routing. A replay needs none of
 * it and must not accept input at all, so the playfield here is its own small
 * renderer over `engine.getSlices()` and `engine.getState()`. It draws the same
 * two lanes with the same approach geometry; it is not pixel-identical to the
 * live game and does not claim to be.
 *
 * ## The clock, and why scrubbing costs the audio
 *
 * While playback is untouched, the *audio* is the clock — `AudioManager` is a
 * singleton, so the position it reports is the position the notes were judged
 * against, with no drift between two clocks to accumulate. `AudioManager` can
 * start, pause and stop, but it cannot seek: there is no public way to set its
 * playback offset. So a scrub re-simulates the engine to the target position and
 * stops the audio, and playback continues silently from there until the viewer
 * is restarted. Silence is the honest failure — a chart at one position and
 * music at another is worse than no music. A `seek(seconds)` on `AudioManager`
 * would remove the whole compromise; it is written up in
 * `docs/_handoff/replay-requests.md`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play, RotateCcw, VolumeX } from 'lucide-react';
import { AudioManager } from '@/lib/audio/AudioManager';
import { GameEngine } from '@/lib/slice-it/engine';
import { modsFromReplay } from '@/lib/slice-it/replay';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { SliceItReplay } from '@/lib/game/replay';
import type { BeatMap, SliceSong } from '@/lib/slice-it/types';

interface ReplayResponse {
  id: string;
  version: string;
  versionMatch: boolean;
  durationMs: number;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null; handle: string | null };
  data: unknown;
}

interface ReplayViewerProps {
  /** `GameReplay.id` — what the leaderboard row links to. */
  replayId: string;
  /** Called when the viewer is dismissed. */
  onClose?: () => void;
}

/** How far ahead of the hit line a note becomes visible, in seconds of chart. */
const APPROACH_SECONDS = 1.4;

export function ReplayViewer({ replayId, onClose }: ReplayViewerProps) {
  const { t } = useTranslation('r-slice-it');

  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioLost, setAudioLost] = useState(false);
  const [position, setPosition] = useState(0);
  const [tally, setTally] = useState({ score: 0, combo: 0, accuracy: 0, maxCombo: 0 });

  const engineRef = useRef<GameEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  /** Virtual clock, used once the audio has been dropped by a scrub. */
  const virtualRef = useRef({ at: 0, since: 0 });
  const audioSyncedRef = useRef(true);

  const payload = useMemo(() => {
    const data = replay?.data as SliceItReplay | undefined;
    return data && Array.isArray(data.inputs) ? data : null;
  }, [replay]);

  const durationSeconds = (replay?.durationMs ?? 0) / 1000;

  /* ── Load the replay, then the song it was recorded on ─────────────────── */

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/slice-it/replay/${replayId}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('replay');
        const body = (await response.json()) as ReplayResponse;
        if (disposed) return;
        setReplay(body);
      } catch (cause) {
        if (!disposed && (cause as Error)?.name !== 'AbortError') setError('replay');
      }
    };

    void load();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [replayId]);

  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    let disposed = false;

    // The store is global and shared with the game, so the viewer borrows it and
    // gives it back: a replay must be rendered under the modifiers it was
    // *recorded* with, and a player who opens one from a leaderboard has not
    // agreed to have their own modifier selection rewritten.
    const store = useSliceItStore.getState();
    const previousModifiers = store.modifiers;
    const previousStatus = store.status;
    const previousSongId = store.songId;

    const engine = new GameEngine();
    engineRef.current = engine;

    const load = async () => {
      try {
        const response = await fetch(`/api/slice-it/songs/${payload.track}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('song');
        const song = (await response.json()) as SliceSong & { analysisData?: BeatMap | null };
        const map = song.analysisData;
        if (!map) throw new Error('chart');
        if (disposed) return;

        useSliceItStore.getState().setModifiers(modsFromReplay(payload.mods));
        useSliceItStore.getState().setStatus('PLAYING');
        useSliceItStore.getState().setIsPaused(true);

        await engine.loadMap({ ...map, id: payload.track, audioUrl: song.audioUrl });
        if (disposed) return;

        engine.loadReplay(payload.inputs);
        setReady(true);
      } catch (cause) {
        if (!disposed && (cause as Error)?.name !== 'AbortError') setError('song');
      }
    };

    void load();

    return () => {
      disposed = true;
      controller.abort();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      AudioManager.getInstance().stop();
      engineRef.current = null;
      const current = useSliceItStore.getState();
      current.setModifiers(previousModifiers);
      current.setStatus(previousStatus);
      current.setSongId(previousSongId);
      current.setIsPaused(false);
    };
  }, [payload]);

  /* ── The frame loop ────────────────────────────────────────────────────── */

  const draw = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height } = canvas;
    const state = engine.getState();
    const now = state.currentTime;

    context.clearRect(0, 0, width, height);
    const laneY = [height * 0.34, height * 0.66];
    const hitX = width * 0.18;

    // Lanes and the hit line, so a note's target is unambiguous.
    context.lineWidth = 2;
    for (let lane = 0; lane < 2; lane++) {
      context.strokeStyle = lane === 0 ? 'rgba(59,130,246,0.35)' : 'rgba(244,114,182,0.35)';
      context.beginPath();
      context.moveTo(0, laneY[lane]);
      context.lineTo(width, laneY[lane]);
      context.stroke();

      context.fillStyle = lane === 0 ? 'rgba(59,130,246,0.9)' : 'rgba(244,114,182,0.9)';
      context.beginPath();
      context.arc(hitX, laneY[lane], 12, 0, Math.PI * 2);
      context.fill();
    }

    // Notes, drawn from the same chart the engine is judging.
    for (const slice of engine.getSlices()) {
      const delta = slice.time - now;
      if (delta > APPROACH_SECONDS || delta < -0.35) continue;
      if (slice.type === 'SILENT') continue;
      const x = hitX + (delta / APPROACH_SECONDS) * (width - hitX);
      const lane = engine.getEffectiveLane(slice, now);
      const y = laneY[lane] ?? laneY[0];

      if (slice.type === 'LONG' && slice.duration) {
        const tailDelta = slice.time + slice.duration - now;
        const tailX =
          hitX + (Math.min(tailDelta, APPROACH_SECONDS) / APPROACH_SECONDS) * (width - hitX);
        context.strokeStyle = 'rgba(148,163,184,0.5)';
        context.lineWidth = 10;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(tailX, y);
        context.stroke();
      }

      context.globalAlpha = slice.hit ? 0.25 : 1;
      context.fillStyle = slice.type === 'BOMB' ? '#ef4444' : lane === 0 ? '#3b82f6' : '#f472b6';
      context.beginPath();
      context.arc(x, y, slice.type === 'BOMB' ? 9 : 11, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }

    // The most recent judgement, in the lane it happened in.
    const feedback = engine.feedbackQueue[engine.feedbackQueue.length - 1];
    if (feedback && performance.now() - feedback.time < 450) {
      context.fillStyle = feedback.color;
      context.font = 'bold 20px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(feedback.text, hitX + 70, (laneY[feedback.lane] ?? laneY[0]) - 20);
    }
  }, []);

  // At rest the viewer paints once and stops: a paused replay has nothing to
  // animate, and a frame loop that runs anyway is a phone warming in a pocket.
  useEffect(() => {
    if (ready && !playing) draw();
  }, [ready, playing, position, draw]);

  useEffect(() => {
    if (!ready || !playing) return;

    const engine = engineRef.current;
    if (!engine) return;
    const audio = AudioManager.getInstance();

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const at = audioSyncedRef.current
        ? audio.getCurrentTime()
        : virtualRef.current.at +
          ((performance.now() - virtualRef.current.since) / 1000) *
            (useSliceItStore.getState().modifiers.speed || 1);

      engine.advanceReplay(at);
      const state = engine.getState();
      setPosition(state.currentTime);
      setTally({
        score: state.score,
        combo: state.combo,
        accuracy: state.accuracy,
        maxCombo: state.maxCombo,
      });
      draw();

      // The track ran out. Stopping here is what makes this loop settle rather
      // than spin forever on a finished replay.
      if (durationSeconds > 0 && state.currentTime >= durationSeconds) setPlaying(false);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [ready, playing, draw, durationSeconds]);

  /* ── Transport ─────────────────────────────────────────────────────────── */

  const togglePlay = useCallback(() => {
    const audio = AudioManager.getInstance();
    setPlaying((was) => {
      const next = !was;
      useSliceItStore.getState().setIsPaused(!next);
      if (next) {
        virtualRef.current = {
          at: engineRef.current?.getReplayTime() ?? 0,
          since: performance.now(),
        };
        if (audioSyncedRef.current) audio.play();
      } else if (audioSyncedRef.current) {
        audio.pause();
      }
      return next;
    });
  }, []);

  const scrub = useCallback((seconds: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    // The audio cannot follow, so it is stopped rather than left playing over a
    // position it no longer matches. See the module header.
    if (audioSyncedRef.current) {
      AudioManager.getInstance().stop();
      audioSyncedRef.current = false;
      setAudioLost(true);
    }
    engine.seekReplay(seconds);
    virtualRef.current = { at: seconds, since: performance.now() };
    setPosition(seconds);
  }, []);

  const restart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setPlaying(false);
    useSliceItStore.getState().setIsPaused(true);
    engine.seekReplay(0);
    // A restart is the one thing that can put the audio back: `AudioManager`
    // plays from the beginning, which is exactly where playback now is.
    AudioManager.getInstance().stop();
    audioSyncedRef.current = true;
    setAudioLost(false);
    virtualRef.current = { at: 0, since: performance.now() };
    setPosition(0);
  }, []);

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (error) {
    return (
      <div className="p-6 text-center text-slice-text-muted">
        {t('replay-load-failed', { defaultValue: 'This replay could not be loaded.' })}
      </div>
    );
  }

  if (replay && !replay.versionMatch) {
    return (
      <div className="p-6 text-center text-slice-text-muted">
        {t('replay-version-mismatch', {
          defaultValue:
            'This replay was recorded on an older version of the game and can no longer be played back accurately.',
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-slice-text">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {t('replay-by', {
              defaultValue: 'Replay by {{name}}',
              name: replay?.author.name ?? '…',
            })}
          </p>
          <p className="text-slice-text-muted text-xs tabular-nums">
            {formatTime(position)} / {formatTime(durationSeconds)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!ready}
            className="neumorphic flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-50"
            aria-label={
              playing
                ? t('replay-pause', { defaultValue: 'Pause replay' })
                : t('replay-play', { defaultValue: 'Play replay' })
            }
          >
            {!ready ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={restart}
            disabled={!ready}
            className="neumorphic flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-50"
            aria-label={t('replay-restart', { defaultValue: 'Restart replay' })}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="neumorphic rounded-full px-3 py-2 text-xs font-bold"
            >
              {t('replay-close', { defaultValue: 'Close' })}
            </button>
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        className="neumorphic-inset w-full rounded-xl"
      />

      <label className="flex items-center gap-3">
        <span className="sr-only">{t('replay-seek', { defaultValue: 'Seek' })}</span>
        <input
          type="range"
          min={0}
          max={Math.max(durationSeconds, 1)}
          step={0.25}
          value={Math.min(position, Math.max(durationSeconds, 1))}
          onChange={(event) => scrub(Number(event.target.value))}
          disabled={!ready}
          className="w-full accent-blue-500"
        />
      </label>

      <div className="flex items-center justify-between gap-4 text-xs tabular-nums">
        <span className="font-mono text-base font-bold text-blue-500">
          {tally.score.toLocaleString()}
        </span>
        <span>{t('replay-combo', { defaultValue: '{{combo}}x combo', combo: tally.combo })}</span>
        <span>
          {t('replay-accuracy', {
            defaultValue: '{{pct}}% acc',
            pct: (tally.accuracy * 100).toFixed(2),
          })}
        </span>
      </div>

      {audioLost && (
        <p className="text-slice-text-muted flex items-center gap-1.5 text-[11px]">
          <VolumeX className="h-3 w-3 shrink-0" />
          {t('replay-audio-after-seek', {
            defaultValue: 'Audio stops after seeking — restart the replay to hear the track.',
          })}
        </p>
      )}
    </div>
  );
}

/** `m:ss`, which is how a track position is read. */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
