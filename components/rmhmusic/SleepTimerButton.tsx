'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';
import { fadedVolume, formatRemaining, nextSleepOption } from '@/lib/rmhmusic/sleep-timer';

/** Cycles the sleep timer Off → 15 → 30 → 45 → 60 min; fades out and pauses at zero. */
export default function SleepTimerButton() {
  const { t } = useTranslation('c-rmhmusic');
  const { pause, setVolume } = usePreviewPlayer();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const baseVolume = useRef(0.7);

  useEffect(() => {
    if (minutes === null) return;
    baseVolume.current = useRmhMusicStore.getState().settings.volume;
    const endsAt = Date.now() + minutes * 60_000;
    const id = setInterval(() => {
      const left = endsAt - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        pause();
        setVolume(baseVolume.current);
        setMinutes(null);
      } else {
        const v = fadedVolume(baseVolume.current, left);
        if (v !== baseVolume.current) setVolume(v);
      }
    }, 250);
    setRemaining(minutes * 60_000);
    return () => {
      clearInterval(id);
      // Cancelled mid-fade: hand the listener their volume back.
      setVolume(baseVolume.current);
    };
  }, [minutes, pause, setVolume]);

  const active = minutes !== null;
  const label = active
    ? t('sleep-timer-on', { defaultValue: 'Sleep timer: {{time}} left. Click to change.', time: formatRemaining(remaining) })
    : t('sleep-timer-off', { defaultValue: 'Sleep timer off. Click to set.' });

  return (
    <button
      onClick={() => setMinutes((m) => nextSleepOption(m))}
      className="flex items-center gap-1 p-2 rounded-(--app-radius-sm) transition-colors"
      style={{
        color: active ? 'var(--app-accent)' : 'var(--app-text-muted)',
        background: active ? 'color-mix(in srgb, var(--app-accent) 15%, transparent)' : 'transparent',
      }}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Moon className="w-4 h-4" />
      {active && <span className="text-xs tabular-nums">{formatRemaining(remaining)}</span>}
    </button>
  );
}
