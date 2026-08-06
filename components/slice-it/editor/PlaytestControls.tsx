'use client';

/**
 * The playtest transport: play from the playhead, loop the selection, stop.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §10.
 *
 * This component owns the frame loop and the lane keys while a playtest runs.
 * The session itself lives in `lib/slice-it/editor/playtest.ts` (a module
 * singleton, so the timeline's draw loop can read hit marks without a render),
 * and everything here is the part that has to be inside React: the buttons, the
 * `requestAnimationFrame` lifecycle, and the key listeners that must go away
 * when the editor unmounts.
 *
 * One loop, not two: the session is ticked from here and the playhead it returns
 * is written straight to the editor store, so the judge and the timeline are
 * reading the same instant. A second `rAF` in the session would judge at one
 * moment and draw at another, which is precisely the class of bug an editor
 * exists to catch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Repeat, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSliceItStore } from '@/lib/slice-it/store';
import { editorState, useEditorStore } from '@/lib/slice-it/editor/store';
import {
  activePlaytest,
  startEditorPlaytest,
  stopEditorPlaytest,
} from '@/lib/slice-it/editor/playtest';

export function PlaytestControls() {
  const { t } = useTranslation('r-slice-it');
  const playtesting = useEditorStore((s) => s.playtesting);
  const keybinds = useSliceItStore((s) => s.keybinds);
  const [judgement, setJudgement] = useState('');
  const held = useRef(new Set<number>());

  /* ── The frame loop ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!playtesting) return;
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const session = activePlaytest();
      if (!session?.running) return;
      const time = session.tick();
      const state = editorState();
      state.setPlayhead(time);

      const feedback = session.drainFeedback();
      if (feedback.length > 0) setJudgement(feedback[feedback.length - 1].text);

      // Past the end of the song there is nothing left to judge, and the audio
      // clock keeps counting — stop rather than scroll into empty timeline.
      const duration = state.song?.duration ?? 0;
      if (duration > 0 && time > duration + 1 && !session.looping) stopEditorPlaytest();
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playtesting]);

  /* ── Lane input ───────────────────────────────────────────────────────── */
  //
  // Straight to the engine, with `event.timeStamp` — the browser's own reading of
  // when the press happened, taken before the event was queued. `submitInput`
  // subtracts the dispatch latency from it, which is what makes a playtest
  // judgement comparable to a real one.
  useEffect(() => {
    if (!playtesting) return;
    const laneFor = (key: string): number | null => {
      if (key === keybinds.lane1) return 0;
      if (key === keybinds.lane2) return 1;
      return null;
    };
    const heldLanes = held.current;

    const onKeyDown = (event: KeyboardEvent) => {
      const lane = laneFor(event.key);
      if (lane === null || event.repeat) return;
      event.preventDefault();
      heldLanes.add(lane);
      activePlaytest()?.press(lane, event.timeStamp);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const lane = laneFor(event.key);
      if (lane === null) return;
      event.preventDefault();
      heldLanes.delete(lane);
      activePlaytest()?.release(lane);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      for (const lane of heldLanes) activePlaytest()?.release(lane);
      heldLanes.clear();
    };
  }, [playtesting, keybinds.lane1, keybinds.lane2]);

  /* A playtest must not outlive the editor: the engine holds the shared
   * AudioManager, and leaving it playing would follow the author to the next
   * page. */
  useEffect(() => () => void (activePlaytest() ? stopEditorPlaytest() : null), []);

  const onPlay = useCallback(() => {
    if (playtesting) {
      stopEditorPlaytest();
      setJudgement('');
      return;
    }
    void startEditorPlaytest();
  }, [playtesting]);

  const onLoop = useCallback(() => {
    if (playtesting) {
      stopEditorPlaytest();
      setJudgement('');
      return;
    }
    void startEditorPlaytest({ loop: true });
  }, [playtesting]);

  const canLoop = useEditorStore((s) => {
    const selected = s.charts[s.active].notes.filter((note) => note.selected);
    return selected.length >= 2 || s.loop !== null;
  });

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label={t('editor-playtest', { defaultValue: 'Playtest' })}
    >
      <button
        type="button"
        className={cn(
          'flex h-9 items-center gap-2 px-3 text-sm',
          playtesting ? 'neumorphic-active' : 'neumorphic-sm',
        )}
        onClick={onPlay}
        title={t('editor-playtest-play-title', {
          defaultValue: 'Play from the playhead (Space)',
        })}
      >
        {playtesting ? (
          <Square className="h-4 w-4" aria-hidden />
        ) : (
          <Play className="h-4 w-4" aria-hidden />
        )}
        {playtesting
          ? t('editor-playtest-stop', { defaultValue: 'Stop' })
          : t('editor-playtest-play', { defaultValue: 'Playtest' })}
      </button>

      <button
        type="button"
        className="neumorphic-sm flex h-9 w-9 items-center justify-center disabled:opacity-40"
        onClick={onLoop}
        disabled={!canLoop && !playtesting}
        title={t('editor-playtest-loop-title', {
          defaultValue: 'Loop the selection (Ctrl+Space)',
        })}
      >
        <Repeat className="h-4 w-4" aria-hidden />
        <span className="sr-only">
          {t('editor-playtest-loop', { defaultValue: 'Loop the selection' })}
        </span>
      </button>

      {playtesting ? (
        <span className="min-w-[4.5rem] text-xs tabular-nums opacity-70" aria-live="polite">
          {judgement}
        </span>
      ) : null}
    </div>
  );
}
