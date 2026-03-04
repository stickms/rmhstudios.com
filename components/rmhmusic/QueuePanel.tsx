'use client';

import { ListMusic, Trash2 } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import { formatDuration } from '@/lib/rmhmusic/utils';

export default function QueuePanel() {
  const { room } = useRmhMusicStore();
  const queue = room?.queue ?? [];

  function removeItem(itemId: string) {
    emit(C2S.QUEUE_REMOVE, { itemId });
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <ListMusic className="w-8 h-8" style={{ color: 'var(--site-text-dim)' }} />
        <p className="text-sm" style={{ color: 'var(--site-text-dim)' }}>Queue is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1">
        <ListMusic className="w-4 h-4" style={{ color: 'var(--site-accent)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--site-text-muted)' }}>
          Queue ({queue.length})
        </span>
      </div>
      {queue.map((item) => (
        <div key={item.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg group" style={{ color: 'var(--site-text)' }}>
          {item.albumArt ? (
            <img src={item.albumArt} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
          ) : (
            <div className="w-8 h-8 rounded shrink-0" style={{ background: 'var(--site-surface)' }} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{item.title}</p>
            <p className="text-xs truncate" style={{ color: 'var(--site-text-muted)' }}>{item.artist}</p>
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'var(--site-text-dim)' }}>
            {formatDuration(item.durationMs)}
          </span>
          <button
            onClick={() => removeItem(item.id)}
            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--site-danger)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
