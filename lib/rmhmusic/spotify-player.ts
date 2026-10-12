'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRmhMusicStore } from './store';
import type { TrackInfo } from './types';
import {
  bindMediaElement,
  clearMediaSession,
  setMediaHandlers,
  setMediaMeta,
} from '@/lib/media/media-session';

let audioSingleton: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioSingleton) {
    audioSingleton = new Audio();
    audioSingleton.preload = 'auto';
    bindOsControls(audioSingleton);
  }
  return audioSingleton;
}

/**
 * Lock-screen / media-key controls, bound once to the singleton so they keep
 * working after the full player unmounts (the site-shell MiniPlayer keeps the
 * audio alive). Play/pause are local — exactly what the in-page buttons do,
 * room or not. Seeking is offered only outside a room, where it cannot desync
 * anyone; skip is a leader action over the socket and is not offered here.
 */
function bindOsControls(audio: HTMLAudioElement): void {
  bindMediaElement(audio);
  const apply = (track: TrackInfo | null, inRoom: boolean) => {
    if (!track) {
      clearMediaSession();
      return;
    }
    setMediaMeta({ title: track.title, artist: track.artist, artwork: track.albumArt || null });
    setMediaHandlers({
      play: () => void audio.play().catch(() => {}),
      pause: () => audio.pause(),
      ...(inRoom
        ? {}
        : {
            seekTo: (s: number) => {
              audio.currentTime = s;
            },
            seekBy: (d: number) => {
              audio.currentTime = Math.max(0, audio.currentTime + d);
            },
          }),
    });
  };
  const initial = useRmhMusicStore.getState();
  apply(initial.currentTrack, !!initial.room);
  useRmhMusicStore.subscribe((s, prev) => {
    if (s.currentTrack !== prev.currentTrack || !!s.room !== !!prev.room) {
      apply(s.currentTrack, !!s.room);
    }
  });
}

export function usePreviewPlayer() {
  const store = useRmhMusicStore();
  const animFrame = useRef<number>(0);

  // Sync volume/muted from store to audio element
  useEffect(() => {
    const audio = getAudio();
    audio.volume = store.settings.muted ? 0 : store.settings.volume;
  }, [store.settings.volume, store.settings.muted]);

  // Set up event listeners once
  useEffect(() => {
    const audio = getAudio();

    function onTimeUpdate() {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = requestAnimationFrame(() => {
        useRmhMusicStore.getState().setPlayback({
          positionMs: Math.round(audio.currentTime * 1000),
          updatedAt: Date.now(),
        });
      });
    }

    function onEnded() {
      useRmhMusicStore.getState().setPlayback({ isPlaying: false });
    }

    function onPlay() {
      useRmhMusicStore.getState().setPlayback({ isPlaying: true, updatedAt: Date.now() });
    }

    function onPause() {
      useRmhMusicStore.getState().setPlayback({
        isPlaying: false,
        positionMs: Math.round(audio.currentTime * 1000),
        updatedAt: Date.now(),
      });
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      cancelAnimationFrame(animFrame.current);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const play = useCallback((previewUrl: string, track: TrackInfo) => {
    const audio = getAudio();
    const { settings } = useRmhMusicStore.getState();
    audio.volume = settings.muted ? 0 : settings.volume;

    audio.src = previewUrl;
    audio.play().catch((err) => {
      console.error('[preview-player] play failed:', err);
    });

    useRmhMusicStore.getState().setCurrentTrack(track);
    useRmhMusicStore.getState().setPlayback({
      trackUri: track.spotifyUri,
      positionMs: 0,
      isPlaying: true,
      updatedAt: Date.now(),
    });
  }, []);

  const pause = useCallback(() => {
    getAudio().pause();
  }, []);

  const resume = useCallback(() => {
    getAudio().play().catch(() => {});
  }, []);

  const seek = useCallback((positionMs: number) => {
    const audio = getAudio();
    audio.currentTime = positionMs / 1000;
  }, []);

  const setVolume = useCallback((volume: number) => {
    getAudio().volume = volume;
    useRmhMusicStore.getState().updateSettings({ volume });
  }, []);

  return { play, pause, resume, seek, setVolume };
}
