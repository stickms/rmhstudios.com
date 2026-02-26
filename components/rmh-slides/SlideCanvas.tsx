'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useSlidesStore } from '@/lib/store/useSlidesStore';
import SlideElement from './SlideElement';
import type { SlideData, SlideElement as SlideElementType } from './types';

interface Props {
  slide: SlideData | null;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (elementId: string, updates: Partial<SlideElementType>) => void;
  onDeleteElement: (elementId: string) => void;
}

export default function SlideCanvas({ slide, selectedElementId, onSelectElement, onUpdateElement, onDeleteElement }: Props) {
  const { zoom, isEditingText, setIsEditingText } = useSlidesStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Logical canvas size: 1920x1080
  const CANVAS_W = 1920;
  const CANVAS_H = 1080;

  // Calculate scale to fit container while maintaining 16:9
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const rect = container.getBoundingClientRect();
      const padding = 40;
      const availW = rect.width - padding * 2;
      const availH = rect.height - padding * 2;
      const scaleX = availW / CANVAS_W;
      const scaleY = availH / CANVAS_H;
      const scale = Math.min(scaleX, scaleY) * (zoom / 100);
      setCanvasScale(scale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [zoom]);

  // Click canvas background to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      onSelectElement(null);
      setIsEditingText(false);
    }
  }, [onSelectElement, setIsEditingText]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditingText) return; // Don't intercept when editing text
      if (!selectedElementId || !slide) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteElement(selectedElementId);
      }

      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowUp') { e.preventDefault(); onUpdateElement(selectedElementId, { y: Math.max(0, (slide.elements.find((el) => el.id === selectedElementId)?.y || 0) - step) }); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onUpdateElement(selectedElementId, { y: Math.min(100, (slide.elements.find((el) => el.id === selectedElementId)?.y || 0) + step) }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); onUpdateElement(selectedElementId, { x: Math.max(0, (slide.elements.find((el) => el.id === selectedElementId)?.x || 0) - step) }); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onUpdateElement(selectedElementId, { x: Math.min(100, (slide.elements.find((el) => el.id === selectedElementId)?.x || 0) + step) }); }

      if (e.key === 'Escape') {
        onSelectElement(null);
        setIsEditingText(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedElementId, slide, isEditingText, onDeleteElement, onUpdateElement, onSelectElement, setIsEditingText]);

  if (!slide) {
    return (
      <div className="flex-1 flex items-center justify-center slides-canvas-wrapper" style={{ background: 'var(--slides-surface)' }}>
        <p style={{ color: 'var(--slides-text-muted)' }}>No slide selected</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 slides-canvas-wrapper">
      <div
        ref={canvasRef}
        className="slides-canvas"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          background: slide.background,
          borderRadius: '4px',
        }}
        onClick={handleCanvasClick}
      >
        {slide.elements.map((element) => (
          <SlideElement
            key={element.id}
            element={element}
            isSelected={element.id === selectedElementId}
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            canvasScale={canvasScale}
            onSelect={() => onSelectElement(element.id)}
            onUpdate={(updates) => onUpdateElement(element.id, updates)}
            onDelete={() => onDeleteElement(element.id)}
          />
        ))}
      </div>
    </div>
  );
}
