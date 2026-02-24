/**
 * RankingItem — Individual draggable item in the ranking list.
 *
 * Uses @dnd-kit/sortable for drag-and-drop reordering.
 * Displays grip handle, rank number, medal for top 3, and item text.
 *
 * Props:
 *   item      — Display text for this ranking entry
 *   rank      — Current rank position (1-based)
 *   isDragging — Whether this item is currently being dragged
 *   isLocked  — Whether ranking has been submitted (non-draggable)
 */
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const MEDALS: Record<number, string> = { 1: '🏆', 2: '🥈', 3: '🥉' };

interface RankingItemProps {
  item: string;
  rank: number;
  isDragging: boolean;
  isLocked: boolean;
  id: string;
}

export default function RankingItem({ item, rank, isDragging, isLocked, id }: RankingItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const medal = MEDALS[rank];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 rounded-lg border px-4 py-3
        border-(--rmhbox-border) bg-(--rmhbox-surface) text-(--rmhbox-text)
        ${isDragging ? 'z-50 shadow-lg scale-105 opacity-90' : ''}
        ${isLocked ? 'opacity-70' : 'cursor-grab active:cursor-grabbing'}
        transition-shadow duration-150
      `}
    >
      {/* Grip handle */}
      {!isLocked && (
        <button
          {...attributes}
          {...listeners}
          className="touch-none text-(--rmhbox-text-muted) hover:text-(--rmhbox-text) focus:outline-none"
          aria-label={`Drag to reorder ${item}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      )}

      {/* Rank number / medal */}
      <span className="flex w-8 shrink-0 items-center justify-center text-lg font-bold">
        {medal ?? `#${rank}`}
      </span>

      {/* Item text */}
      <span className="flex-1 text-base font-medium">{item}</span>

      {/* Locked indicator */}
      {isLocked && (
        <span className="text-xs text-(--rmhbox-text-muted)">🔒</span>
      )}
    </div>
  );
}
