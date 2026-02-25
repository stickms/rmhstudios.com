/**
 * MediaQueue — Queue panel displaying all queued videos with add/remove/reorder.
 */
'use client';

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import QueueItem from './QueueItem';
import AddMediaModal from './AddMediaModal';

export default function MediaQueue() {
  const room = useRmhTubeStore((s) => s.room);
  const [showAddModal, setShowAddModal] = useState(false);

  if (!room) return null;

  const isHost = room.myUserId === room.hostUserId;
  const canAdd = isHost || room.settings.allowMemberQueue;

  const handleRemove = useCallback((itemId: string) => {
    emit(C2S.QUEUE_REMOVE, { itemId });
  }, []);

  const handlePlayItem = useCallback((itemId: string) => {
    if (isHost) {
      emit(C2S.QUEUE_PLAY_ITEM, { itemId });
    }
  }, [isHost]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--rmhtube-border)">
        <h3 className="text-sm font-semibold text-(--rmhtube-text-muted)">
          Queue ({room.queue.length})
        </h3>
        {canAdd && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors bg-(--rmhtube-accent) text-white hover:bg-(--rmhtube-accent-hover)"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {room.queue.length === 0 ? (
          <p className="text-sm text-center py-8 text-(--rmhtube-text-dim)">
            Queue is empty
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
                onRemove={() => handleRemove(item.id)}
                onPlay={() => handlePlayItem(item.id)}
              />
            );
          })
        )}
      </div>

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
