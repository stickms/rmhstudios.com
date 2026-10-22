'use client';

/**
 * The room's timeline, in the site's own controls.
 *
 * Before this the control bar showed the last anchor's `currentTime` — a clock
 * that jumped every two seconds (once per heartbeat) and stood still between —
 * and offered no way to seek except the provider's native scrubber. Now:
 *
 *  - the position is the anchor PROJECTED to server time, refreshed four times
 *    a second by writing to the DOM through refs (no React render per tick);
 *  - the leader can drag it; release sends one seek, applied optimistically so
 *    the bar answers the drag rather than the round trip;
 *  - everyone else sees the same bar read-only.
 *
 * Hidden for a live source (no timeline) and until the duration is known.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { getServerNow } from '@/lib/rmhtube/clock';
import { extrapolate } from '@/lib/rmhtube/sync-math';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { formatDuration } from '@/lib/rmhtube/utils';
import HeatStrip from './HeatStrip';

const TICK_MS = 250;
const SEEK_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Seek the room (leader only), applying it locally at once. */
export function seekRoom(time: number): void {
  const store = useRmhTubeStore.getState();
  const room = store.room;
  if (!room) return;
  const to = Math.max(0, time);
  store.setVideoState({
    ...room.videoState,
    currentTime: to,
    updatedAt: getServerNow(),
    stalled: false,
    rev: room.videoState.rev + 1,
  });
  emit(C2S.SYNC_SEEK, { time: to });
}

export default function SeekBar({ duration, isLeader }: { duration: number; isLeader: boolean }) {
  const { t } = useTranslation('c-rmhtube');
  const inputRef = useRef<HTMLInputElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const [dragValue, setDragValue] = useState<number | null>(null);

  useEffect(() => {
    const paint = () => {
      if (draggingRef.current) return;
      const vs = useRmhTubeStore.getState().room?.videoState;
      if (!vs) return;
      const pos = Math.min(duration, Math.max(0, extrapolate(vs, getServerNow())));
      if (inputRef.current) inputRef.current.value = String(pos);
      if (fillRef.current) fillRef.current.style.width = `${(pos / duration) * 100}%`;
      if (timeRef.current) timeRef.current.textContent = formatDuration(pos);
    };
    paint();
    const id = setInterval(paint, TICK_MS);
    return () => clearInterval(id);
  }, [duration]);

  const commit = (value: number) => {
    draggingRef.current = false;
    setDragValue(null);
    seekRoom(value);
  };

  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-1 bg-(--app-bg-subtle)">
      <span
        ref={timeRef}
        className="w-12 shrink-0 text-right text-xs tabular-nums text-(--app-text-dim)"
      >
        {dragValue !== null ? formatDuration(dragValue) : formatDuration(0)}
      </span>
      <div className="relative flex flex-1 items-center">
      {isLeader ? (
        <input
          ref={inputRef}
          type="range"
          min={0}
          max={duration}
          step={0.1}
          defaultValue={0}
          aria-label={t('seek-bar', { defaultValue: 'Seek' })}
          aria-valuetext={dragValue !== null ? formatDuration(dragValue) : undefined}
          className="h-1 w-full cursor-pointer accent-(--app-accent)"
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onInput={(e) => {
            draggingRef.current = true;
            const v = Number((e.target as HTMLInputElement).value);
            setDragValue(v);
            if (timeRef.current) timeRef.current.textContent = formatDuration(v);
          }}
          onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          // Keyboard arrows (and a pointer that left mid-drag) land here.
          onKeyUp={(e) => {
            if (SEEK_KEYS.has(e.key)) commit(Number((e.target as HTMLInputElement).value));
          }}
        />
      ) : (
        <div
          role="progressbar"
          aria-label={t('seek-bar-readonly', { defaultValue: 'Playback position' })}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          className="relative h-1 w-full overflow-hidden rounded-full bg-(--app-surface-active)"
        >
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0 bg-(--app-accent)"
            style={{ width: '0%' }}
          />
        </div>
      )}
      <HeatStrip duration={duration} />
      </div>
      <span className="w-12 shrink-0 text-xs tabular-nums text-(--app-text-dim)">
        {formatDuration(duration)}
      </span>
    </div>
  );
}
