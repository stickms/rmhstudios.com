'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useSlidesStore } from '@/lib/store/useSlidesStore';
import TextElement from './TextElement';
import ImageElement from './ImageElement';
import ShapeElement from './ShapeElement';
import type { SlideElement as SlideElementType } from './types';

interface Props {
  element: SlideElementType;
  isSelected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  canvasScale: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<SlideElementType>) => void;
  onDelete: () => void;
}

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export default function SlideElement({
  element,
  isSelected,
  canvasWidth,
  canvasHeight,
  canvasScale,
  onSelect,
  onUpdate,
  onDelete,
}: Props) {
  const { isEditingText, setIsEditingText } = useSlidesStore();
  const elRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; elX: number; elY: number } | null>(null);
  const resizeStartRef = useRef<{
    mouseX: number; mouseY: number;
    elX: number; elY: number;
    elW: number; elH: number;
    handle: HandlePosition;
  } | null>(null);

  const pxX = (element.x / 100) * canvasWidth;
  const pxY = (element.y / 100) * canvasHeight;
  const pxW = (element.width / 100) * canvasWidth;
  const pxH = (element.height / 100) * canvasHeight;

  // ── Drag handling ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isEditingText && element.type === 'text') return; // Don't drag during text edit
    e.stopPropagation();
    onSelect();

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elX: element.x,
      elY: element.y,
    };
    setIsDragging(true);
  }, [element.x, element.y, element.type, isEditingText, onSelect]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = (e.clientX - dragStartRef.current.mouseX) / canvasScale;
      const dy = (e.clientY - dragStartRef.current.mouseY) / canvasScale;
      const newX = dragStartRef.current.elX + (dx / canvasWidth) * 100;
      const newY = dragStartRef.current.elY + (dy / canvasHeight) * 100;
      onUpdate({
        x: Math.max(-element.width / 2, Math.min(100 - element.width / 2, newX)),
        y: Math.max(-element.height / 2, Math.min(100 - element.height / 2, newY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, canvasScale, canvasWidth, canvasHeight, element.width, element.height, onUpdate]);

  // ── Resize handling ──
  const handleResizeStart = useCallback((e: React.MouseEvent, handle: HandlePosition) => {
    e.stopPropagation();
    e.preventDefault();

    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elX: element.x,
      elY: element.y,
      elW: element.width,
      elH: element.height,
      handle,
    };
    setIsResizing(true);
  }, [element.x, element.y, element.width, element.height]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const { mouseX, mouseY, elX, elY, elW, elH, handle } = resizeStartRef.current;
      const dx = ((e.clientX - mouseX) / canvasScale / canvasWidth) * 100;
      const dy = ((e.clientY - mouseY) / canvasScale / canvasHeight) * 100;

      let newX = elX, newY = elY, newW = elW, newH = elH;

      // Horizontal
      if (handle.includes('e')) { newW = Math.max(3, elW + dx); }
      if (handle.includes('w')) { newW = Math.max(3, elW - dx); newX = elX + dx; }

      // Vertical
      if (handle.includes('s')) { newH = Math.max(3, elH + dy); }
      if (handle.includes('n')) { newH = Math.max(3, elH - dy); newY = elY + dy; }

      onUpdate({ x: newX, y: newY, width: newW, height: newH });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, canvasScale, canvasWidth, canvasHeight, onUpdate]);

  // Double-click for text editing
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (element.type === 'text') {
      setIsEditingText(true);
    }
  }, [element.type, setIsEditingText]);

  const handles: HandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div
      ref={elRef}
      style={{
        position: 'absolute',
        left: pxX,
        top: pxY,
        width: pxW,
        height: pxH,
        zIndex: element.zIndex,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        outline: isSelected ? '2px solid var(--slides-element-selected)' : 'none',
        outlineOffset: '1px',
        cursor: isDragging ? 'grabbing' : (isEditingText && element.type === 'text') ? 'text' : 'grab',
        userSelect: isEditingText && element.type === 'text' ? 'text' : 'none',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Render child based on type */}
      {element.type === 'text' && (
        <TextElement
          element={element}
          isEditing={isSelected && isEditingText}
          onContentChange={(content) => onUpdate({ content })}
        />
      )}
      {element.type === 'image' && (
        <ImageElement element={element} />
      )}
      {element.type === 'shape' && (
        <ShapeElement element={element} />
      )}

      {/* Resize handles */}
      {isSelected && !isEditingText && handles.map((handle) => (
        <div
          key={handle}
          className={`slides-element-handle handle-${handle}`}
          onMouseDown={(e) => handleResizeStart(e, handle)}
        />
      ))}
    </div>
  );
}
