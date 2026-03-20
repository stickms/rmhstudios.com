import { useEffect, useRef, useCallback } from 'react';
import { useRochCloudStore } from './store';
import { getStreamUrl } from './api';

let audioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.crossOrigin = 'anonymous';
    audioEl.preload = 'auto';
  }
  return audioEl;
}

export function useRochCloudPlayer() {
  const store = useRochCloudStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const play = useCallback((trackId: number, token: string) => {
    const audio = getAudio();
    const url = getStreamUrl(trackId, token);
    audio.src = url;
    audio.volume = store.settings.muted ? 0 : store.settings.volume;
    audio.play().catch(() => {});
    store.setPlayback({ isPlaying: true, positionMs: 0, updatedAt: Date.now() });
  }, [store.settings.volume, store.settings.muted]);

  const playTrack = useCallback((track: import('./types').SCTrack) => {
    const token = useRochCloudStore.getState().auth.accessToken;
    if (!token) return;

    store.setCurrentTrack(track);
    const audio = getAudio();
    const url = getStreamUrl(track.id, token);
    audio.src = url;
    audio.volume = store.settings.muted ? 0 : store.settings.volume;
    audio.play().catch(() => {});
    store.setPlayback({ isPlaying: true, positionMs: 0, durationMs: track.durationMs, updatedAt: Date.now() });
  }, [store.settings.volume, store.settings.muted]);

  const pause = useCallback(() => {
    getAudio().pause();
    store.setPlayback({ isPlaying: false });
  }, []);

  const resume = useCallback(() => {
    getAudio().play().catch(() => {});
    store.setPlayback({ isPlaying: true, updatedAt: Date.now() });
  }, []);

  const seek = useCallback((ms: number) => {
    const audio = getAudio();
    audio.currentTime = ms / 1000;
    store.setPlayback({ positionMs: ms, updatedAt: Date.now() });
  }, []);

  const setVolume = useCallback((vol: number) => {
    getAudio().volume = vol;
    store.updateSettings({ volume: vol, muted: false });
  }, []);

  const nextTrack = useCallback(() => {
    const state = useRochCloudStore.getState();
    const { queue, queueIndex, settings } = state;
    if (queue.length === 0) return;

    let nextIdx: number;
    if (settings.shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (settings.repeat === 'all') nextIdx = 0;
        else {
          store.setPlayback({ isPlaying: false });
          return;
        }
      }
    }
    state.playQueue(nextIdx);
    const track = queue[nextIdx];
    if (track) {
      const token = state.auth.accessToken;
      if (token) {
        const audio = getAudio();
        audio.src = getStreamUrl(track.id, token);
        audio.volume = state.settings.muted ? 0 : state.settings.volume;
        audio.play().catch(() => {});
      }
    }
  }, []);

  const prevTrack = useCallback(() => {
    const state = useRochCloudStore.getState();
    const { queue, queueIndex } = state;
    const audio = getAudio();

    // If past 3 seconds, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      store.setPlayback({ positionMs: 0, updatedAt: Date.now() });
      return;
    }

    if (queueIndex <= 0) {
      audio.currentTime = 0;
      store.setPlayback({ positionMs: 0, updatedAt: Date.now() });
      return;
    }

    const prevIdx = queueIndex - 1;
    state.playQueue(prevIdx);
    const track = queue[prevIdx];
    if (track) {
      const token = state.auth.accessToken;
      if (token) {
        audio.src = getStreamUrl(track.id, token);
        audio.volume = state.settings.muted ? 0 : state.settings.volume;
        audio.play().catch(() => {});
      }
    }
  }, []);

  // Position tracking & ended handler
  useEffect(() => {
    const audio = getAudio();

    const onTimeUpdate = () => {
      store.setPlayback({ positionMs: audio.currentTime * 1000, updatedAt: Date.now() });
    };

    const onEnded = () => {
      const state = useRochCloudStore.getState();
      if (state.settings.repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        nextTrack();
      }
    };

    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        store.setPlayback({ durationMs: audio.duration * 1000 });
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('durationchange', onDurationChange);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  }, [nextTrack]);

  // Sync volume/mute changes
  useEffect(() => {
    const audio = getAudio();
    audio.volume = store.settings.muted ? 0 : store.settings.volume;
  }, [store.settings.volume, store.settings.muted]);

  return { play, playTrack, pause, resume, seek, setVolume, nextTrack, prevTrack };
}
