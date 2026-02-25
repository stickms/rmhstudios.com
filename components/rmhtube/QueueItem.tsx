/**
 * QueueItem — Individual queue entry with thumbnail, title, duration, and remove button.
 */
'use client';

import { X, GripVertical, Play } from 'lucide-react';
import { formatDuration } from '@/lib/rmhtube/utils';
import type { ClientQueueItem } from '@/lib/rmhtube/types';

interface QueueItemProps {
  item: ClientQueueItem;
  isActive: boolean;
  isHost: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onPlay: () => void;
}

export default function QueueItem({ item, isActive, isHost, canRemove, onRemove, onPlay }: QueueItemProps) {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-(--rmhtube-accent-dim) border border-(--rmhtube-accent)/30'
          : 'bg-(--rmhtube-bg) hover:bg-(--rmhtube-surface-hover)'
      }`}
    >
      {/* Drag handle (host only) */}
      {isHost && (
        <div className="shrink-0 cursor-grab text-(--rmhtube-text-dim) hover:text-(--rmhtube-text-muted)">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* Thumbnail */}
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="shrink-0 w-16 h-9 rounded object-cover bg-(--rmhtube-surface)"
        />
      ) : (
        <div className="shrink-0 w-16 h-9 rounded bg-(--rmhtube-surface) flex items-center justify-center">
          <Play className="h-4 w-4 text-(--rmhtube-text-dim)" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={isHost ? onPlay : undefined} role={isHost ? 'button' : undefined}>
        <p className={`text-sm font-medium truncate ${isHost ? 'cursor-pointer hover:text-(--rmhtube-accent)' : ''} text-(--rmhtube-text)`}>
          {item.title}
        </p>
        <p className="text-xs text-(--rmhtube-text-dim)">
          {item.addedByName} · {formatDuration(item.duration)}
        </p>
      </div>

      {/* Remove */}
      {canRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-danger) hover:bg-(--rmhtube-danger-dim)"
          title="Remove from queue"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
