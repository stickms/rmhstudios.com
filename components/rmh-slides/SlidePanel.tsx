'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import type { SlideData, SlideElement } from './types';

interface Props {
  slides: SlideData[];
  slideOrder: string[];
  selectedSlideId: string | null;
  onSelectSlide: (id: string) => void;
  onAddSlide: (afterSlideId?: string, layoutElements?: SlideElement[]) => void;
  onDeleteSlide: (id: string) => void;
  onDuplicateSlide: (id: string) => void;
  onReorderSlides: (newOrder: string[]) => void;
}

export default function SlidePanel({
  slides,
  slideOrder,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onDeleteSlide,
  onDuplicateSlide,
  onReorderSlides,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slideId: string } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slideOrder.indexOf(active.id as string);
    const newIndex = slideOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(slideOrder, oldIndex, newIndex);
    onReorderSlides(newOrder);
  }, [slideOrder, onReorderSlides]);

  const handleContextMenu = useCallback((e: React.MouseEvent, slideId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, slideId });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  return (
    <div
      className="flex flex-col h-full border-r"
      style={{
        width: 'var(--slides-panel-width)',
        minWidth: 'var(--slides-panel-width)',
        background: 'var(--slides-surface)',
        borderColor: 'var(--slides-border)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--slides-border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--slides-text-muted)' }}>SLIDES</span>
        <span className="text-xs" style={{ color: 'var(--slides-text-subtle)' }}>{slideOrder.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={slideOrder} strategy={verticalListSortingStrategy}>
            {slideOrder.map((slideId, index) => {
              const slide = slides.find((s) => s.id === slideId);
              return (
                <SortableThumbnail
                  key={slideId}
                  slideId={slideId}
                  slide={slide || null}
                  index={index}
                  isActive={slideId === selectedSlideId}
                  onClick={() => onSelectSlide(slideId)}
                  onContextMenu={(e) => handleContextMenu(e, slideId)}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      {/* Add slide button */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--slides-border)' }}>
        <button
          onClick={() => onAddSlide(selectedSlideId || undefined)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--slides-accent)', color: 'var(--slides-accent-fg)' }}
        >
          <Plus size={14} />
          Add Slide
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="slides-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { onAddSlide(contextMenu.slideId); setContextMenu(null); }}>
            Add slide after
          </button>
          <button onClick={() => { onDuplicateSlide(contextMenu.slideId); setContextMenu(null); }}>
            Duplicate
          </button>
          <button
            className="danger"
            onClick={() => { onDeleteSlide(contextMenu.slideId); setContextMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sortable Thumbnail ──
function SortableThumbnail({
  slideId,
  slide,
  index,
  isActive,
  onClick,
  onContextMenu,
}: {
  slideId: string;
  slide: SlideData | null;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slideId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-start gap-2">
        <span className="text-[10px] pt-1 w-4 text-right flex-shrink-0" style={{ color: 'var(--slides-text-subtle)' }}>
          {index + 1}
        </span>
        <div className={`slides-thumbnail flex-1 ${isActive ? 'active' : ''}`}>
          <div
            className="slides-thumbnail-content"
            style={{ background: slide?.background || '#1a1a2e' }}
          >
            {/* Mini-rendered slide content */}
            {slide?.elements.map((el) => (
              <ThumbnailElement key={el.id} element={el} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Miniature element for thumbnails ──
function ThumbnailElement({ element }: { element: SlideElement }) {
  const { x, y, width, height, type, content, style: elStyle } = element;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    height: `${height}%`,
    overflow: 'hidden',
    zIndex: element.zIndex,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
  };

  if (type === 'text') {
    return (
      <div
        style={{
          ...baseStyle,
          fontSize: '3px',
          lineHeight: 1.2,
          color: elStyle.color || '#fff',
          textAlign: (elStyle.textAlign as React.CSSProperties['textAlign']) || 'left',
        }}
        dangerouslySetInnerHTML={{ __html: content || '' }}
      />
    );
  }

  if (type === 'image') {
    if (!content) {
      return (
        <div style={{ ...baseStyle, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)' }} />
      );
    }
    return (
      <img src={content} alt="" style={{ ...baseStyle, objectFit: (elStyle.objectFit as React.CSSProperties['objectFit']) || 'cover' }} />
    );
  }

  if (type === 'shape') {
    return (
      <div style={{ ...baseStyle }}>
        <MiniShape shapeType={content} fill={elStyle.fill || '#f97316'} />
      </div>
    );
  }

  return null;
}

function MiniShape({ shapeType, fill }: { shapeType: string; fill: string }) {
  switch (shapeType) {
    case 'circle':
      return <svg width="100%" height="100%" viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="48" ry="48" fill={fill} /></svg>;
    case 'triangle':
      return <svg width="100%" height="100%" viewBox="0 0 100 100"><polygon points="50,2 98,98 2,98" fill={fill} /></svg>;
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        const r = i % 2 === 0 ? 48 : 20;
        pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
      }
      return <svg width="100%" height="100%" viewBox="0 0 100 100"><polygon points={pts.join(' ')} fill={fill} /></svg>;
    }
    default:
      return <svg width="100%" height="100%" viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" fill={fill} /></svg>;
  }
}
