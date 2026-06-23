/**
 * MediaQueue — Queue panel displaying all queued videos with add/remove/reorder,
 * shuffle (Phase 3.6), loop toggle (Phase 3.7), history (Phase 3.9),
 * total duration display, and voting props.
 */
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Shuffle, Repeat, ChevronDown, ChevronUp, History } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { formatTotalDuration } from '@/lib/rmhtube/utils';
import QueueItem from './QueueItem';
import AddMediaModal from './AddMediaModal';

export default function MediaQueue() {
  const room = useRmhTubeStore((s) => s.room);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Total queue duration (sum of all item durations)
  const totalDuration = useMemo(() => {
    if (!room) return 0;
    return room.queue.reduce((sum, item) => sum + (item.duration ?? 0), 0);
  }, [room]);

  const handleRemove = useCallback((itemId: string) => {
    emit(C2S.QUEUE_REMOVE, { itemId });
  }, []);

  const handlePlayItem = useCallback((itemId: string) => {
    if (room && room.myUserId === room.hostUserId) {
      emit(C2S.QUEUE_PLAY_ITEM, { itemId });
    }
  }, [room]);

  const handleShuffle = useCallback(() => {
    emit(C2S.QUEUE_SHUFFLE);
  }, []);

  const handleLoopToggle = useCallback(() => {
    if (!room) return;
    emit(C2S.ROOM_UPDATE_SETTINGS, {
      settings: { loopQueue: !room.settings.loopQueue },
    });
  }, [room]);

  const handleVote = useCallback((itemId: string) => {
    emit(C2S.QUEUE_VOTE, { itemId });
  }, []);

  const handleReAddFromHistory = useCallback((url: string, title: string) => {
    emit(C2S.QUEUE_ADD, { url, title });
  }, []);

  const { t } = useTranslation("c-rmhtube");

  if (!room) return null;

  const isHost = room.myUserId === room.hostUserId;
  const canAdd = isHost || room.settings.allowMemberQueue;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--rmhtube-border)">
        <h3 className="text-sm font-semibold text-(--rmhtube-text-muted)">
          {t("queue-count", { defaultValue: "Queue ({{count}})", count: room.queue.length })}
          {totalDuration > 0 && (
            <span className="font-normal text-(--rmhtube-text-dim)">
              {' · '}{formatTotalDuration(totalDuration)}
            </span>
          )}
        </h3>

        <div className="flex items-center gap-1">
          {/* Loop Toggle (Phase 3.7) — host/mod only */}
          {isHost && (
            <button
              onClick={handleLoopToggle}
              className={`p-1 rounded-md transition-colors ${
                room.settings.loopQueue
                  ? 'text-(--rmhtube-accent) bg-(--rmhtube-accent-dim)'
                  : 'text-(--rmhtube-text-dim) hover:text-(--rmhtube-text-muted) hover:bg-(--rmhtube-surface-hover)'
              }`}
              title={room.settings.loopQueue ? t("loop-queue-on", { defaultValue: "Loop queue: ON" }) : t("loop-queue-off", { defaultValue: "Loop queue: OFF" })}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Shuffle (Phase 3.6) — host/mod only */}
          {isHost && (
            <button
              onClick={handleShuffle}
              className="p-1 rounded-md transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-text-muted) hover:bg-(--rmhtube-surface-hover)"
              title={t("shuffle-queue", { defaultValue: "Shuffle queue" })}
            >
              <Shuffle className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Add */}
          {canAdd && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors bg-(--rmhtube-accent) text-white hover:bg-(--rmhtube-accent-hover)"
            >
              <Plus className="h-3 w-3" />
              {t("add", { defaultValue: "Add" })}
            </button>
          )}
        </div>
      </div>

      {/* Queue Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {room.queue.length === 0 ? (
          <p className="text-sm text-center py-8 text-(--rmhtube-text-dim)">
            {t("queue-empty", { defaultValue: "Queue is empty" })}
          </p>
        ) : (
          room.queue.map((item) => {
            const isActive = room.currentItem?.id === item.id;
            const canRemove = isHost || item.addedBy === room.myUserId;
            return (
              <QueueItem
                key={item.id}
                item={item}
                isActive={isActive}
                isHost={isHost}
                canRemove={canRemove}
                queueVoting={room.settings.queueVoting}
                onRemove={() => handleRemove(item.id)}
                onPlay={() => handlePlayItem(item.id)}
                onVote={() => handleVote(item.id)}
              />
            );
          })
        )}
      </div>

      {/* History Section (Phase 3.9) */}
      {room.playedItems && room.playedItems.length > 0 && (
        <div className="border-t border-(--rmhtube-border)">
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-(--rmhtube-text-dim) hover:text-(--rmhtube-text-muted) transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {t("history-count", { defaultValue: "History ({{count}})", count: room.playedItems.length })}
            </span>
            {showHistory ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showHistory && (
            <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-1">
              {room.playedItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleReAddFromHistory(item.url, item.title)}
                  className="flex items-start gap-2 w-full p-2 rounded-lg text-left transition-colors bg-(--rmhtube-bg) hover:bg-(--rmhtube-surface-hover) group"
                  title={t("re-add-to-queue", { defaultValue: "Click to re-add to queue" })}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-(--rmhtube-text) group-hover:text-(--rmhtube-accent)">
                      {item.title}
                    </p>
                    <p className="text-xs text-(--rmhtube-text-dim)">
                      {item.addedByName}
                      {item.addedAt && (
                        <> · {new Date(item.addedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </p>
                  </div>
                  <Plus className="h-3.5 w-3.5 shrink-0 mt-0.5 text-(--rmhtube-text-dim) opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Media Modal */}
      {showAddModal && (
        <AddMediaModal
          onClose={() => setShowAddModal(false)}
          onAdd={(url, title) => {
            emit(C2S.QUEUE_ADD, { url, title: title || undefined });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}
