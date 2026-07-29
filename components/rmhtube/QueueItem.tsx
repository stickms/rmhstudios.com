/**
 * QueueItem — Individual queue entry with thumbnail, title, duration,
 * voting (Phase 3.5), and remove button.
 */
'use client';

import { X, GripVertical, Play, ThumbsUp, ListPlus } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { formatDuration } from '@/lib/rmhtube/utils';
import type { ClientQueueItem } from '@/lib/rmhtube/types';

interface QueueItemProps {
  item: ClientQueueItem;
  isActive: boolean;
  isHost: boolean;
  canRemove: boolean;
  queueVoting: boolean;
  onRemove: () => void;
  onPlay: () => void;
  onVote: () => void;
  onAddToPlaylist?: () => void;
}

export default function QueueItem({ item, isActive, isHost, canRemove, queueVoting, onRemove, onPlay, onVote, onAddToPlaylist }: QueueItemProps) {
  const { t } = useTranslation("c-rmhtube");
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-(--app-accent-dim) border border-(--app-accent)/30'
          : 'bg-(--app-bg) hover:bg-(--app-surface-hover)'
      }`}
    >
      {/* Drag handle (host only) */}
      {isHost && (
        <div className="shrink-0 cursor-grab text-(--app-text-dim) hover:text-(--app-text-muted)">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* Thumbnail */}
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="shrink-0 w-16 h-9 rounded object-cover bg-(--app-surface)"
        />
      ) : (
        <div className="shrink-0 w-16 h-9 rounded bg-(--app-surface) flex items-center justify-center">
          <Play className="h-4 w-4 text-(--app-text-dim)" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={isHost ? onPlay : undefined} role={isHost ? 'button' : undefined}>
        <p className={`text-sm font-medium truncate ${isHost ? 'cursor-pointer hover:text-(--app-accent)' : ''} text-(--app-text)`}>
          {item.title}
        </p>
        <p className="text-xs text-(--app-text-dim)">
          {item.addedByName} · {formatDuration(item.duration)}
        </p>
      </div>

      {/* Vote (Phase 3.5) */}
      {queueVoting && (
        <button
          onClick={onVote}
          className={`shrink-0 flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
            item.votedByMe
              ? 'text-(--app-accent) bg-(--app-accent-dim)'
              : 'text-(--app-text-dim) hover:text-(--app-accent) hover:bg-(--app-accent-dim)'
          }`}
          title={t("vote-for-this-item", { defaultValue: "Vote for this item" })}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {item.votes > 0 && <span>{item.votes}</span>}
        </button>
      )}

      {/* Add to playlist */}
      {onAddToPlaylist && (
        <button
          onClick={onAddToPlaylist}
          className="shrink-0 rounded p-1 transition-colors text-(--app-text-dim) hover:text-(--app-accent) hover:bg-(--app-accent-dim)"
          title={t("add-to-playlist", { defaultValue: "Add to playlist" })}
        >
          <ListPlus className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Remove */}
      {canRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 rounded p-1 transition-colors text-(--app-text-dim) hover:text-(--app-danger) hover:bg-(--app-danger-dim)"
          title={t("remove-from-queue", { defaultValue: "Remove from queue" })}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
