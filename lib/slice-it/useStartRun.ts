/**
 * Loading a song and starting a run.
 *
 * Pulled out of `MainMenu` because the same sequence has to serve two callers
 * that used to duplicate it: pressing Play on a track, and a multiplayer match
 * starting. The multiplayer copy passed `skipIncrement` and then called the
 * single-player one anyway, so a host incremented the play count twice.
 *
 * The sequence:
 *
 *  1. Fetch the song, with its chart. (The library list no longer ships charts —
 *     they are hundreds of KB each.)
 *  2. Fetch and decode the audio.
 *  3. If the chart is missing or was produced by the old generator, build a
 *     current one *here* and post it back, so the next player to open this song
 *     gets it from the database. Songs uploaded since the analyser moved
 *     server-side never take this path.
 *  4. Hand it to the engine.
 *  5. Single player: run a local 3-2-1. Multiplayer: report `loaded` and let the
 *     server run the countdown for everyone at once.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { AudioManager } from '@/lib/audio/AudioManager';
import { BEATMAP_VERSION, generateBeatmap, isStaleAnalysis } from './beatmap';
import { COUNTDOWN_SECONDS } from './constants';
import { useSliceItStore } from './store';
import { reportLoaded } from './net/client';
import type { GameEngine } from './engine';
import type { BeatMap, SliceSong } from './types';

export interface StartRunOptions {
  /** Skip the play-count increment — the server already counted this one. */
  countPlay?: boolean;
  /** Report `loaded` and wait for the server countdown instead of a local one. */
  multiplayer?: boolean;
}

export function useStartRun(engine: GameEngine | null) {
  const [isLoading, setIsLoading] = useState(false);
  /** Guards against a double-click launching two loads of the same song. */
  const inFlight = useRef(false);

  const startRun = useCallback(
    async (songId: string, options: StartRunOptions = {}) => {
      if (!engine || inFlight.current) return;
      inFlight.current = true;

      const store = useSliceItStore.getState();
      setIsLoading(true);
      store.setIsLoadingSong(true);
      store.setLoadingProgress(0);
      store.setStatus('PLAYING');
      engine.setMultiplayer(Boolean(options.multiplayer));

      try {
        store.setLoadingProgressText('FETCHING TRACK…');
        // O7 — ask for the one difficulty this run will play. The tiers are
        // nested (easy ⊆ normal ⊆ hard ⊆ expert), so the untrimmed response is
        // mostly the same notes four times, on the exact path
        // `LOAD_TIMEOUT_MS` exists to accommodate.
        //
        // Safe to pin here because the difficulty cannot change between this
        // read and `loadMap`: it is chosen in the menu before `startRun`, and
        // `engine.reset()` (H6's restart) reuses the slices it already
        // resolved rather than re-reading the map.
        const response = await fetch(
          `/api/slice-it/songs/${songId}?difficulty=${encodeURIComponent(
            store.modifiers.difficulty,
          )}`,
        );
        if (!response.ok) throw new Error(`Song fetch failed: ${response.status}`);
        const song = (await response.json()) as SliceSong;
        // The run's receipt, minted by that read. Null for a signed-out player,
        // whose score is not going on a leaderboard anyway.
        store.setRunToken(song.runToken ?? null);

        if (options.countPlay !== false) {
          // Fire-and-forget: a play count is not worth delaying a song for.
          void fetch(`/api/slice-it/songs/${songId}/play`, { method: 'POST' }).catch(() => {});
        }

        store.setLoadingProgress(20);
        const audioResponse = await fetch(song.audioUrl);
        if (!audioResponse.ok) throw new Error(`Audio fetch failed: ${audioResponse.status}`);
        const arrayBuffer = await audioResponse.arrayBuffer();

        AudioManager.getInstance().initialize();
        const context = AudioManager.getInstance().getContext();
        if (!context) throw new Error('Audio context unavailable');

        store.setLoadingProgress(45);
        store.setLoadingProgressText('DECODING AUDIO…');
        const audioBuffer = await context.decodeAudioData(arrayBuffer);

        let map: BeatMap;
        if (song.analysisData && !isStaleAnalysis(song.analysisData)) {
          store.setLoadingProgress(70);
          store.setLoadingProgressText('RETRIEVING SPECTRAL ANALYSIS…');
          map = song.analysisData;
        } else {
          // Legacy song: no chart, or one from the old detector.
          store.setLoadingProgress(55);
          store.setLoadingProgressText('ANALYZING SPECTRAL FLUX…');
          const generated = generateBeatmap(audioBuffer, {
            id: song.id,
            name: song.title,
            artist: song.artist,
            bpmHint: song.bpm > 0 ? song.bpm : undefined,
          });
          map = generated;

          // Backfill, so this only ever happens once for this song.
          void fetch(`/api/slice-it/songs/${song.id}/patch-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              analysisData: { ...generated, analysisVersion: BEATMAP_VERSION },
            }),
          }).catch(() => {});
        }

        // The id inside a stored chart may predate the row it belongs to, and
        // the engine seeds its modifier RNG from it — so pin both.
        map = { ...map, id: song.id, audioUrl: song.audioUrl };

        store.setLoadingProgress(85);
        store.setLoadingProgressText('CALIBRATING GAME ENGINE…');
        await engine.loadMap(map, audioBuffer);
        store.setLoadingProgress(100);

        if (options.multiplayer) {
          store.setLoadingProgressText('WAITING FOR PLAYERS…');
          reportLoaded();
        } else {
          store.setIsLoadingSong(false);
          runLocalCountdown(engine);
        }
      } catch (error) {
        console.error('[slice-it] failed to start run', error);
        // Back to the menu rather than stranding the player on a loading screen
        // that will never finish.
        const failed = useSliceItStore.getState();
        failed.setIsLoadingSong(false);
        failed.setStatus('MENU');
        throw error;
      } finally {
        setIsLoading(false);
        inFlight.current = false;
      }
    },
    [engine],
  );

  return { startRun, isLoading };
}

/** The single-player 3-2-1, driven off the store so a menu exit cancels it. */
function runLocalCountdown(engine: GameEngine): void {
  const store = useSliceItStore.getState();
  let remaining = COUNTDOWN_SECONDS;
  store.setCountdown(remaining);

  const tick = setInterval(() => {
    // Every tick re-reads the status: leaving the run mid-countdown must not
    // start audio three seconds later over the menu.
    if (useSliceItStore.getState().status !== 'PLAYING') {
      clearInterval(tick);
      useSliceItStore.getState().setCountdown(0);
      return;
    }
    remaining -= 1;
    useSliceItStore.getState().setCountdown(Math.max(0, remaining));
    if (remaining <= 0) {
      clearInterval(tick);
      engine.start();
    }
  }, 1000);
}
