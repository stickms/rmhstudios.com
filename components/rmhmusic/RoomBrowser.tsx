'use client';

import { useState, useEffect } from 'react';
import { Users, Music, Lock } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { emit, connectToRmhMusic } from '@/lib/rmhmusic/socket';
import { C2S, S2C } from '@/lib/rmhmusic/events';
import type { PublicRoomInfo } from '@/lib/rmhmusic/types';

export default function RoomBrowser() {
  const [rooms, setRooms] = useState<PublicRoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { connectionStatus } = useRmhMusicStore();

  async function fetchRooms() {
    setLoading(true);
    try {
      const socket = await connectToRmhMusic();
      socket.once(S2C.ROOM_BROWSE_RESULT, (data: { rooms: PublicRoomInfo[] }) => {
        setRooms(data.rooms);
        setLoading(false);
      });
      emit(C2S.ROOM_BROWSE, { limit: 20 });
    } catch {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (connectionStatus === 'connected') fetchRooms();
  }, [connectionStatus]);

  if (rooms.length === 0 && !loading) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--site-text-muted)' }}>
        Public Rooms
      </h3>
      {loading && <p className="text-sm" style={{ color: 'var(--site-text-dim)' }}>Loading rooms...</p>}
      <div className="grid gap-2">
        {rooms.map((room) => (
          <button
            key={room.roomId}
            onClick={() => emit(C2S.ROOM_JOIN, { code: room.code })}
            className="flex items-center gap-3 p-3 rounded-xl text-left transition-colors w-full"
            style={{ background: 'var(--site-surface)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--site-text)' }}>{room.name}</span>
                {room.hasPassword && <Lock className="w-3 h-3 shrink-0" style={{ color: 'var(--site-text-dim)' }} />}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--site-text-muted)' }}>
                  <Users className="w-3 h-3" /> {room.memberCount}/{room.maxMembers}
                </span>
                {room.currentTrack && (
                  <span className="flex items-center gap-1 text-xs truncate" style={{ color: 'var(--site-text-dim)' }}>
                    <Music className="w-3 h-3" /> {room.currentTrack}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'color-mix(in srgb, var(--site-accent) 15%, transparent)', color: 'var(--site-accent)' }}>
              {room.code}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
