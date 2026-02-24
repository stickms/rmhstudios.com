/**
 * RankingList — Drag-and-drop sortable list for ranking 5 items.
 *
 * Uses @dnd-kit/sortable with vertical list strategy.
 * Items display medals for top 3 positions (🏆, 🥈, 🥉).
 * After submission: items become non-draggable with "Locked In" indicator.
 * During lock-in phase: pulsing border for urgency.
 *
 * Props:
 *   items           — Array of item labels
 *   ranking         — Current ranking order (indices into items array)
 *   onRankingChange — Callback when user reorders items
 *   hasSubmitted    — Whether user has already submitted
 *   isLockIn        — Whether in last-chance lock-in phase
 */
'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import RankingItem from './RankingItem';

interface RankingListProps {
  items: string[];
  ranking: number[];
  onRankingChange: (ranking: number[]) => void;
  hasSubmitted: boolean;
  isLockIn: boolean;
}

export default function RankingList({
  items,
  ranking,
  onRankingChange,
  hasSubmitted,
  isLockIn,
}: RankingListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const sortableIds = ranking.map((idx) => `rank-${idx}`);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    const newRanking = arrayMove(ranking, oldIndex, newIndex);
    onRankingChange(newRanking);
  }

  return (
    <div
      className={`
        w-full max-w-md mx-auto rounded-xl border-2 p-3
        ${isLockIn && !hasSubmitted ? 'animate-pulse border-(--rmhbox-danger)' : 'border-(--rmhbox-border)'}
        ${hasSubmitted ? 'border-(--rmhbox-accent)' : ''}
      `}
    >
      {/* Status header */}
      <div className="mb-3 text-center text-sm font-medium">
        {hasSubmitted ? (
          <span className="text-(--rmhbox-accent)">✅ Locked In</span>
        ) : isLockIn ? (
          <span className="text-(--rmhbox-danger) font-bold">⚡ Last chance! Drag to reorder</span>
        ) : (
          <span className="text-(--rmhbox-text-muted)">Drag to rank from best to worst</span>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}

        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {ranking.map((itemIdx, rank) => (
              <RankingItem
                key={`rank-${itemIdx}`}
                id={`rank-${itemIdx}`}
                item={items[itemIdx]}
                rank={rank + 1}
                isDragging={activeId === `rank-${itemIdx}`}
                isLocked={hasSubmitted}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
