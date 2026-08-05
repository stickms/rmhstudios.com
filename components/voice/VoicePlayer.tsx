'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/voice/peaks';
import { VoiceWaveform } from '@/components/voice/VoiceWaveform';

/**
 * Playback for a voice note inside a message bubble.
 *
 * Three rules, each one a thing voice messengers routinely get wrong:
 *
 * 1. **Never autoplay.** Audio that starts on its own is the single most hostile
 *    thing a chat app can do — it plays a private message out loud in a room the
 *    recipient did not choose. `preload="metadata"` fetches the duration and
 *    nothing else; bytes move only after a press.
 * 2. **Resume where you left off.** Position is remembered per clip, so scrolling
 *    away from a four-minute note and coming back does not restart it. Kept in a
 *    module-level map (per tab, not per component) because the bubble unmounts
 *    every time it scrolls out of the virtualised range.
 * 3. **Variable speed.** 1× / 1.5× / 2× — the reason people tolerate long voice
 *    notes at all.
 *
 * No blur, no glass: this lives inside a repeated list item, and the elevation
 * budget for those is zero.
 */

/** Playback position per audio URL, so a remount resumes rather than restarts. */
const resumePositions = new Map<string, number>();

const SPEEDS = [1, 1.5, 2] as const;

export function VoicePlayer({
  src,
  durationMs,
  peaks,
  className,
}: {
  src: string;
  durationMs: number | null;
  peaks: number[];
  className?: string;
}) {
  const { t } = useTranslation('feed');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(() => resumePositions.get(src) ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Metadata duration wins once known; the stored value is what lets the bubble
  // show a length before the file is touched at all.
  const [measuredMs, setMeasuredMs] = useState<number | null>(null);
  const totalMs = measuredMs ?? durationMs ?? 0;
  const progress = totalMs > 0 ? Math.min(1, (position * 1000) / totalMs) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = SPEEDS[speedIndex];
  }, [speedIndex]);

  // Persist the position on unmount too — `timeupdate` fires ~4×/s, so pausing
  // and immediately navigating away would otherwise lose up to a quarter second
  // and, more visibly, a scroll-away mid-clip would lose everything.
  useEffect(() => {
    // Captured now, not in the cleanup: by teardown React may already have
    // detached the element from the ref.
    const audio = audioRef.current;
    return () => {
      if (audio && audio.currentTime > 0) resumePositions.set(src, audio.currentTime);
    };
  }, [src]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    try {
      const resume = resumePositions.get(src) ?? 0;
      // Re-seek on the first press after a remount: the element is new, so its
      // currentTime is 0 even though we remember where the user was.
      if (resume > 0 && audio.currentTime < 0.05) audio.currentTime = resume;
      audio.playbackRate = SPEEDS[speedIndex];
      await audio.play();
    } catch {
      setFailed(true);
    }
  }, [playing, speedIndex, src]);

  const seek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const next = Math.min(Math.max(fraction, 0), 1) * audio.duration;
      audio.currentTime = next;
      setPosition(next);
      resumePositions.set(src, next);
    },
    [src],
  );

  const cycleSpeed = useCallback(() => {
    setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  }, []);

  const remainingLabel = formatDuration(
    playing || position > 0 ? Math.max(0, totalMs - position * 1000) : totalMs,
  );

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-2', className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setMeasuredMs(Math.round(d * 1000));
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
          resumePositions.delete(src);
        }}
        onTimeUpdate={(e) => {
          const time = e.currentTarget.currentTime;
          setPosition(time);
          resumePositions.set(src, time);
        }}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        // 44px: this is the primary control of the bubble and it sits beside a
        // scrollable thread, where a smaller target is a mis-tap that scrolls.
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-current/15 text-current transition-opacity hover:opacity-80 disabled:opacity-40"
        aria-label={
          playing
            ? t('voice-pause', { defaultValue: 'Pause voice message' })
            : t('voice-play', { defaultValue: 'Play voice message' })
        }
      >
        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
      </button>

      <div className="relative min-w-0 flex-1">
        <VoiceWaveform peaks={peaks} progress={progress} />
        {/* A native range input laid over the bars: seeking works with a
            pointer, a keyboard and a screen reader without re-implementing any
            of it. Invisible, because the bars ARE the visual. */}
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 1000)}
          onChange={(e) => seek(Number(e.currentTarget.value) / 1000)}
          disabled={failed || totalMs <= 0}
          aria-label={t('voice-seek', { defaultValue: 'Seek within voice message' })}
          aria-valuetext={formatDuration(position * 1000)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <span className="shrink-0 text-[11px] tabular-nums opacity-70">
        {failed ? t('voice-unavailable', { defaultValue: 'Unavailable' }) : remainingLabel}
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-semibold tabular-nums transition-opacity hover:opacity-80"
        aria-label={t('voice-speed', { defaultValue: 'Playback speed' })}
      >
        {SPEEDS[speedIndex]}&times;
      </button>
    </div>
  );
}
