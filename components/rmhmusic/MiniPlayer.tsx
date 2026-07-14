'use client';

/**
 * Site-wide music mini-player. RMHMusic's audio element is a module singleton,
 * so playback keeps going after you leave /rmhmusic — but its controls unmount
 * with the full PlayerBar. This dock, mounted in the site shell, re-surfaces
 * play/pause, progress, and a way back to the player on standard site pages.
 *
 * It is intentionally NOT rendered on /rmhmusic (top-level route, outside the
 * site shell) or full-screen games, so it never fights the full PlayerBar. And
 * because leaving a room clears `store.room`, playback here is always solo — no
 * socket events are emitted, so room sync can't be broken from this surface.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Play, Pause, Music, X, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';

function MiniPlayerInner() {
  const { t } = useTranslation('c-rmhmusic');
  const currentTrack = useRmhMusicStore((s) => s.currentTrack);
  const playback = useRmhMusicStore((s) => s.playback);
  const setCurrentTrack = useRmhMusicStore((s) => s.setCurrentTrack);
  const setPlayback = useRmhMusicStore((s) => s.setPlayback);
  const { pause, resume } = usePreviewPlayer();
  const [progress, setProgress] = useState(0);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const durationMs = currentTrack?.durationMs ?? 0;
  useEffect(() => {
    if (interval.current) clearInterval(interval.current);
    if (playback.isPlaying && durationMs > 0) {
      interval.current = setInterval(() => {
        const elapsed = Date.now() - playback.updatedAt;
        setProgress(Math.min(playback.positionMs + elapsed, durationMs));
      }, 200);
    } else {
      setProgress(playback.positionMs);
    }
    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, [playback.isPlaying, playback.positionMs, playback.updatedAt, durationMs]);

  if (!currentTrack) return null;

  const percent = currentTrack.durationMs
    ? Math.min(100, (progress / currentTrack.durationMs) * 100)
    : 0;

  const stop = () => {
    pause();
    setPlayback({ isPlaying: false, trackUri: null });
    setCurrentTrack(null);
  };

  return (
    <div
      className="glass-overlay fixed bottom-above-dock left-2 right-2 z-40 mx-auto max-w-sm overflow-hidden md:bottom-4 md:left-auto md:right-4"
      role="region"
      aria-label={t('mini-player', { defaultValue: 'Music mini-player' })}
    >
      <div className="h-0.5 w-full bg-site-surface-active">
        <div className="h-full bg-site-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center gap-2.5 p-2">
        {currentTrack.albumArt ? (
          <img src={currentTrack.albumArt} alt="" className="h-10 w-10 shrink-0 rounded-site-sm object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site-sm bg-site-bg">
            <Music className="h-4 w-4 text-site-text-muted" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-site-text">{currentTrack.title}</p>
          <p className="truncate text-xs text-site-text-muted">{currentTrack.artist}</p>
        </div>
        <button
          type="button"
          onClick={() => (playback.isPlaying ? pause() : resume())}
          aria-label={
            playback.isPlaying
              ? t('mini-pause', { defaultValue: 'Pause' })
              : t('mini-play', { defaultValue: 'Play' })
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-site-accent text-site-accent-fg transition-opacity hover:opacity-90"
        >
          {playback.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <Link
          to="/rmhmusic/player"
          aria-label={t('mini-open', { defaultValue: 'Open player' })}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          <Maximize2 className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={stop}
          aria-label={t('mini-close', { defaultValue: 'Stop and close' })}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function MiniPlayer() {
  // Only mount the (store-subscribing) inner player once a track is loaded, so
  // idle site pages don't subscribe to the music store or run intervals.
  const hasTrack = useRmhMusicStore((s) => !!s.currentTrack);
  if (!hasTrack) return null;
  return <MiniPlayerInner />;
}
