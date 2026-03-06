import { useEffect, useCallback } from 'react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';
import { connectToRmhMusic, emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import Visualizer from '@/components/rmhmusic/Visualizer';
import PlayerBar from '@/components/rmhmusic/PlayerBar';
import SearchPanel from '@/components/rmhmusic/SearchPanel';
import ChatPanel from '@/components/rmhmusic/ChatPanel';
import { useParams, useRouter } from '@tanstack/react-router';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { room } = useRmhMusicStore();
  const { play, pause, resume, seek } = usePreviewPlayer();

  // Connect and join room
  useEffect(() => {
    async function joinRoom() {
      try {
        await connectToRmhMusic();
        // The roomId could be a code — try joining
        emit(C2S.ROOM_JOIN, { code: roomId });
        useRmhMusicStore.getState().setChatOpen(true);
      } catch {
        router.navigate({ to: '/rmhmusic' });
      }
    }
    joinRoom();

    return () => {
      emit(C2S.ROOM_LEAVE, {});
    };
  }, [roomId]);

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

  // Sync playback for non-host
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
      <Visualizer />

      {room && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20">
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-xl"
            style={{ background: 'color-mix(in srgb, var(--site-bg) 70%, transparent)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--site-text)' }}>{room.name}</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--site-surface)', color: 'var(--site-accent)' }}>
              {room.code}
            </span>
            <span className="text-xs" style={{ color: 'var(--site-text-muted)' }}>
              {room.members.length} listening
            </span>
          </div>
        </div>
      )}

      {room?.currentTrack?.albumArt && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <img src={room.currentTrack.albumArt} alt="" className="w-48 h-48 md:w-64 md:h-64 rounded-2xl shadow-2xl opacity-30" />
        </div>
      )}

      <SearchPanel onPlay={handlePlay} />
      <ChatPanel />
      <PlayerBar />
    </div>
  );
}
