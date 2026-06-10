import { lazy, Suspense, useEffect, useCallback } from 'react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';

const Visualizer = lazy(() => import('@/components/rmhmusic/Visualizer'));
import PlayerBar from '@/components/rmhmusic/PlayerBar';
import SearchPanel from '@/components/rmhmusic/SearchPanel';
import ChatPanel from '@/components/rmhmusic/ChatPanel';

export default function PlayerPage() {
  const { room, currentTrack } = useRmhMusicStore();
  const { play, pause, resume, seek } = usePreviewPlayer();

  const handlePlay = useCallback(async (track: any) => {
    if (!track.previewUrl) return;

    play(track.previewUrl, {
      spotifyUri: track.uri ?? track.spotifyUri,
      title: track.title,
      artist: track.artist,
      albumArt: track.albumArt ?? '',
      durationMs: track.durationMs,
      previewUrl: track.previewUrl,
    });

    // If in a room and host, broadcast
    if (room && room.hostUserId === room.myUserId) {
      emit(C2S.MUSIC_PLAY, {
        trackUri: track.uri ?? track.spotifyUri,
        positionMs: 0,
        track: {
          spotifyUri: track.uri ?? track.spotifyUri,
          title: track.title,
          artist: track.artist,
          albumArt: track.albumArt ?? '',
          durationMs: track.durationMs,
          previewUrl: track.previewUrl,
        },
      });
    }
  }, [play, room]);

  // Sync playback from room events (non-host)
  useEffect(() => {
    if (!room || room.hostUserId === room.myUserId) return;

    const unsub = useRmhMusicStore.subscribe((state, prevState) => {
      const track = state.currentTrack;
      if (state.playback.trackUri !== prevState.playback.trackUri && state.playback.trackUri && track?.previewUrl) {
        play(track.previewUrl, track);
      } else if (state.playback.isPlaying !== prevState.playback.isPlaying) {
        if (state.playback.isPlaying) resume();
        else pause();
      } else if (Math.abs(state.playback.positionMs - prevState.playback.positionMs) > 2000) {
        seek(state.playback.positionMs);
      }
    });

    return unsub;
  }, [room?.roomId, room?.hostUserId, room?.myUserId, play, pause, resume, seek]);

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--site-bg)' }}>
      <Suspense fallback={null}><Visualizer /></Suspense>

      {/* Floating album art */}
      {currentTrack?.albumArt && (
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
