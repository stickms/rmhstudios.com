'use client';

import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useGameStore } from '@/lib/versecraft/store';
import { scoreLineArrangePoem } from '@/lib/versecraft/scoring';
import type { LineArrangePuzzleData, PoemLine } from '@/lib/versecraft/types';

function SortableLine({ line, index }: { line: PoemLine; index: number }) {
  const { t } = useTranslation("c-versecraft");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 0,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <motion.div
        className="flex items-center gap-3 px-4 py-3 rounded cursor-grab active:cursor-grabbing mb-2 transition-all"
        style={{
          backgroundColor: isDragging ? 'rgba(196, 163, 90, 0.2)' : 'rgba(42, 34, 53, 0.7)',
          border: `1px solid ${isDragging ? 'rgba(196, 163, 90, 0.5)' : 'rgba(196, 163, 90, 0.15)'}`,
          opacity: isDragging ? 0.9 : 1,
          boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.3)' : 'none',
        }}
        whileHover={{
          borderColor: 'rgba(196, 163, 90, 0.3)',
          backgroundColor: 'rgba(42, 34, 53, 0.85)',
        }}
      >
        {/* Drag handle indicator */}
        <span className="text-sm" style={{ color: '#555' }}>
          {index + 1}.
        </span>

        {/* Line indicators */}
        <div className="flex gap-1">
          {line.strongOpener && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(92, 184, 92, 0.2)', color: '#5cb85c' }}>
              {t("opener", { defaultValue: "opener" })}
            </span>
          )}
          {line.strongCloser && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(196, 163, 90, 0.2)', color: '#c4a35a' }}>
              {t("closer", { defaultValue: "closer" })}
            </span>
          )}
        </div>

        {/* Line text */}
        <p
          className="flex-1 text-sm md:text-base italic"
          style={{
            fontFamily: 'var(--font-playfair, serif)',
            color: '#e8e0d0',
          }}
        >
          {line.text}
        </p>

        {/* Drag indicator */}
        <span style={{ color: '#555' }}>⠿</span>
      </motion.div>
    </div>
  );
}

export function LineArrangePuzzle() {
  const { t } = useTranslation("c-versecraft");
  const { currentPuzzle, arrangedLineIds, setArrangedLineIds, submitPoem } = useGameStore();

  const puzzle = currentPuzzle as LineArrangePuzzleData | null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const arrangedLines = useMemo(() => {
    if (!puzzle) return [];
    return arrangedLineIds
      .map(id => puzzle.lines.find(l => l.id === id))
      .filter((l): l is PoemLine => l !== undefined);
  }, [puzzle, arrangedLineIds]);

  const poemText = useMemo(
    () => arrangedLines.map(l => l.text).join('\n'),
    [arrangedLines]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = arrangedLineIds.indexOf(active.id as string);
      const newIndex = arrangedLineIds.indexOf(over.id as string);
      setArrangedLineIds(arrayMove(arrangedLineIds, oldIndex, newIndex));
    }
  }, [arrangedLineIds, setArrangedLineIds]);

  const handleSubmit = useCallback(() => {
    if (!puzzle) return;
    const score = scoreLineArrangePoem(arrangedLines, {
      optimalOrders: puzzle.optimalOrders,
      scoringMode: puzzle.scoringMode,
    });
    const wordIds = arrangedLines.map(l => l.id);
    submitPoem(score, wordIds, poemText, 'line_arrange');
  }, [puzzle, arrangedLines, poemText, submitPoem]);

  if (!puzzle) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: '#a89888' }}>{t("no-puzzle-loaded", { defaultValue: "No puzzle loaded." })}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="p-4 md:p-6 text-center" style={{ backgroundColor: 'rgba(26, 21, 32, 0.9)' }}>
        <h2
          className="text-xl md:text-2xl mb-2"
          style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
        >
          {t("arrange-the-lines", { defaultValue: "Arrange the Lines" })}
        </h2>
        <p className="text-sm md:text-base" style={{ color: '#a89888' }}>
          {puzzle.promptText || t("drag-drop-lines-prompt", { defaultValue: "Drag and drop the lines to create the best poem." })}
        </p>
      </div>

      {/* Sortable lines */}
      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={arrangedLineIds}
              strategy={verticalListSortingStrategy}
            >
              {arrangedLines.map((line, i) => (
                <SortableLine key={line.id} line={line} index={i} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* Submit area */}
      <div
        className="p-4 md:p-6"
        style={{
          backgroundColor: 'rgba(26, 21, 32, 0.95)',
          borderTop: '1px solid rgba(196, 163, 90, 0.2)',
        }}
      >
        <div className="max-w-2xl mx-auto flex justify-end">
          <button
            onClick={handleSubmit}
            className="px-8 py-2.5 rounded text-base font-semibold transition-all"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.3)',
              border: '1px solid rgba(196, 163, 90, 0.6)',
              color: '#c4a35a',
            }}
          >
            {t("submit-arrangement", { defaultValue: "Submit Arrangement" })}
          </button>
        </div>
      </div>
    </div>
  );
}
