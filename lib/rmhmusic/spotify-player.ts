'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRmhMusicStore } from './store';

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

let sdkLoaded = false;
let sdkReady = false;
const readyCallbacks: (() => void)[] = [];

function loadSpotifySDK(): Promise<void> {
  if (sdkReady) return Promise.resolve();
  if (sdkLoaded) {
    return new Promise((resolve) => readyCallbacks.push(resolve));
  }

  sdkLoaded = true;
  return new Promise((resolve) => {
    readyCallbacks.push(resolve);
    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkReady = true;
      readyCallbacks.forEach((cb) => cb());
      readyCallbacks.length = 0;
    };
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
  });
}

async function fetchAccessToken(): Promise<string | null> {
  const res = await fetch('/api/rmhmusic/spotify/token');
  const data = await res.json();
  if (!data.connected) return null;
  return data.accessToken;
}

async function refreshAndGetToken(): Promise<string | null> {
  // Token endpoint auto-refreshes via BetterAuth, so just re-fetch
  return fetchAccessToken();
}

export function useSpotifyPlayer() {
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const store = useRmhMusicStore();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const token = await fetchAccessToken();
      if (!token || cancelled) return;

      // Mark as connected immediately so UI doesn't show the connect overlay
      store.setSpotify({ isConnected: true });

      await loadSpotifySDK();
      if (cancelled) return;

      const player = new window.Spotify.Player({
        name: 'RMH Music',
        getOAuthToken: async (cb: (token: string) => void) => {
          let t = await fetchAccessToken();
          if (!t) t = await refreshAndGetToken();
          if (t) cb(t);
        },
        volume: store.settings.volume,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        if (cancelled) return;
        store.setSpotify({ isConnected: true, deviceId: device_id, isPremium: true });
        setIsReady(true);
      });

      player.addListener('not_ready', () => {
        store.setSpotify({ deviceId: null });
        setIsReady(false);
      });

      player.addListener('player_state_changed', (state: any) => {
        if (!state || cancelled) return;
        const track = state.track_window?.current_track;
        if (track) {
          store.setCurrentTrack({
            spotifyUri: track.uri,
            title: track.name,
            artist: track.artists.map((a: any) => a.name).join(', '),
            albumArt: track.album.images?.[0]?.url ?? '',
            durationMs: track.duration_ms,
          });
        }
        store.setPlayback({
          trackUri: track?.uri ?? null,
          positionMs: state.position,
          isPlaying: !state.paused,
          updatedAt: Date.now(),
        });
      });

      player.addListener('authentication_error', async () => {
        await refreshAndGetToken();
      });

      await player.connect();
      playerRef.current = player;
    }

    init();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (spotifyUri: string, positionMs = 0) => {
    const token = await fetchAccessToken();
    const deviceId = useRmhMusicStore.getState().spotify.deviceId;
    if (!token || !deviceId) return;

    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [spotifyUri], position_ms: positionMs }),
    });
  }, []);

  const pause = useCallback(async () => {
    playerRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    playerRef.current?.resume();
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    playerRef.current?.seek(positionMs);
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    playerRef.current?.setVolume(volume);
    useRmhMusicStore.getState().updateSettings({ volume });
  }, []);

  return { player: playerRef, isReady, play, pause, resume, seek, setVolume };
}
