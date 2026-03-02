'use client';

import { Users } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';

export default function MemberList() {
  const { room } = useRmhMusicStore();
  if (!room) return null;

  return (
    <div className="px-3 py-2 border-b" style={{ borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Users className="w-3.5 h-3.5" style={{ color: 'var(--site-text-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--site-text-muted)' }}>
          {room.members.length} listener{room.members.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {room.members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
            style={{ background: 'var(--site-surface)', color: m.isConnected ? 'var(--site-text)' : 'var(--site-text-dim)' }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: m.isConnected ? 'var(--site-success)' : 'var(--site-text-dim)' }}
            />
            {m.userName}
            {m.isHost && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--site-accent)' }}>HOST</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
