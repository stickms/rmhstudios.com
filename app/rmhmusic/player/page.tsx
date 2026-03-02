'use client';

import { useEffect, useCallback } from 'react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { useSpotifyPlayer } from '@/lib/rmhmusic/spotify-player';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import Visualizer from '@/components/rmhmusic/Visualizer';
import PlayerBar from '@/components/rmhmusic/PlayerBar';
import SearchPanel from '@/components/rmhmusic/SearchPanel';
import ChatPanel from '@/components/rmhmusic/ChatPanel';
import SpotifyConnect from '@/components/rmhmusic/SpotifyConnect';

export default function PlayerPage() {
  const { spotify, room, currentTrack } = useRmhMusicStore();
  const { isReady, play, pause, resume, seek } = useSpotifyPlayer();

  const handlePlay = useCallback(async (uri: string, track: any) => {
    await play(uri);

    // If in a room and host, broadcast
    if (room && room.hostUserId === room.myUserId) {
      emit(C2S.MUSIC_PLAY, {
        trackUri: uri,
        positionMs: 0,
        track: {
          spotifyUri: uri,
          title: track.title,
          artist: track.artist,
          albumArt: track.albumArt ?? '',
          durationMs: track.durationMs,
        },
      });
    }
  }, [play, room]);

  // Sync playback from room events (non-host)
  useEffect(() => {
    if (!room || room.hostUserId === room.myUserId || !isReady) return;

    const unsub = useRmhMusicStore.subscribe((state, prevState) => {
      if (state.playback.trackUri !== prevState.playback.trackUri && state.playback.trackUri) {
        play(state.playback.trackUri, state.playback.positionMs);
      } else if (state.playback.isPlaying !== prevState.playback.isPlaying) {
        if (state.playback.isPlaying) resume();
        else pause();
      } else if (Math.abs(state.playback.positionMs - prevState.playback.positionMs) > 2000) {
        seek(state.playback.positionMs);
      }
    });

    return unsub;
  }, [room?.roomId, room?.hostUserId, room?.myUserId, isReady, play, pause, resume, seek]);

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--site-bg)' }}>
      <Visualizer />

      {!spotify.isConnected && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div className="text-center p-8 rounded-2xl backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--site-bg) 85%, transparent)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--site-text)', fontFamily: 'var(--site-font-display)' }}>
              Connect Spotify to Play
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--site-text-muted)' }}>
              Spotify Premium is required for playback.
            </p>
            <SpotifyConnect />
          </div>
        </div>
      )}

      {/* Floating album art */}
      {currentTrack?.albumArt && spotify.isConnected && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <img
            src={currentTrack.albumArt}
            alt=""
            className="w-48 h-48 md:w-64 md:h-64 rounded-2xl shadow-2xl opacity-30"
          />
        </div>
      )}

      <SearchPanel onPlay={handlePlay} />
      <ChatPanel />
      <PlayerBar />
    </div>
  );
}
