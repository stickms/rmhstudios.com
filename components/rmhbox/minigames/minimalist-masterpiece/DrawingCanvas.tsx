/**
 * DrawingCanvas — Straight-line drawing surface.
 *
 * Each stroke is a straight line from point A to point B.
 * Two input methods:
 *   1. Click-drag: first endpoint on mousedown, second on mouseup (preview during drag)
 *   2. Click-click: first endpoint on first click, second on next click (preview on move)
 * All lines use round end-caps. Supports undo via edit history.
 * Players can select a background color for the canvas.
 */
'use client';

import { useRef, useState, useCallback } from 'react';
import type { MMStroke } from './DrawingCard';

interface DrawingCanvasProps {
  strokes: MMStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<MMStroke[]>>;
  selectedColor: string;
  selectedWidth: number;
  backgroundColor: string;
  maxStrokes: number;
  hasSubmitted: boolean;
  onSubmit: () => void;
  onUndo: () => void;
}

interface Point {
  x: number;
  y: number;
}

export default function DrawingCanvas({
  strokes,
  setStrokes,
  selectedColor,
  selectedWidth,
  backgroundColor,
  maxStrokes,
  hasSubmitted,
  onUndo,
}: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Pending first endpoint for click-click mode
  const [pendingStart, setPendingStart] = useState<Point | null>(null);
  // Preview endpoint (current mouse position while placing a line)
  const [previewEnd, setPreviewEnd] = useState<Point | null>(null);
  // Whether the user is currently dragging
  const isDragging = useRef(false);
  const dragStart = useRef<Point | null>(null);

  const canDraw = !hasSubmitted && strokes.length < maxStrokes;

  const getSvgPoint = useCallback((e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 300,
      y: ((e.clientY - rect.top) / rect.height) * 300,
    };
  }, []);

  /** Create a finalized line stroke from two points. */
  const createStroke = useCallback((start: Point, end: Point): MMStroke => ({
    id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    points: [
      { x: start.x, y: start.y, pressure: 0.5 },
      { x: end.x, y: end.y, pressure: 0.5 },
    ],
    color: selectedColor,
    width: selectedWidth,
    timestamp: Date.now(),
  }), [selectedColor, selectedWidth]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!canDraw) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);

    const pt = getSvgPoint(e);

    if (pendingStart) {
      // Click-click mode: second click places endpoint
      setStrokes((prev) => [...prev, createStroke(pendingStart, pt)]);
      setPendingStart(null);
      setPreviewEnd(null);
      return;
    }

    // Start a potential drag
    isDragging.current = false;
    dragStart.current = pt;
    setPreviewEnd(pt);
  }, [canDraw, getSvgPoint, pendingStart, createStroke, setStrokes]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const pt = getSvgPoint(e);

    if (pendingStart) {
      // Click-click mode: show preview from pending start to current mouse
      setPreviewEnd(pt);
      return;
    }

    if (dragStart.current) {
      // Drag mode: track as dragging once the mouse moves
      isDragging.current = true;
      setPreviewEnd(pt);
    }
  }, [getSvgPoint, pendingStart]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (pendingStart) return; // Click-click mode is handled in pointerDown

    const pt = getSvgPoint(e);

    if (dragStart.current) {
      if (isDragging.current) {
        // Drag mode: finalize line from dragStart to current position
        setStrokes((prev) => [...prev, createStroke(dragStart.current!, pt)]);
        setPreviewEnd(null);
      } else {
        // Click without drag: enter click-click mode (first click sets start)
        setPendingStart(dragStart.current);
        setPreviewEnd(pt);
      }
      dragStart.current = null;
      isDragging.current = false;
    }
  }, [getSvgPoint, pendingStart, createStroke, setStrokes]);

  const handlePointerLeave = useCallback(() => {
    // Cancel drag if mouse leaves canvas
    if (dragStart.current && isDragging.current) {
      dragStart.current = null;
      isDragging.current = false;
      setPreviewEnd(null);
    }
    // Don't cancel click-click mode: the user may re-enter the canvas
  }, []);

  /** Cancel click-click mode on Escape key */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && pendingStart) {
      setPendingStart(null);
      setPreviewEnd(null);
    }
  }, [pendingStart]);

  // Compute preview line start
  const previewStart = pendingStart ?? dragStart.current;

  return (
    <div className="relative" tabIndex={0} onKeyDown={handleKeyDown}>
      <svg
        ref={svgRef}
        viewBox="0 0 300 300"
        className={`w-72 h-72 rounded-lg border-2 touch-none outline-none ${
          canDraw
            ? 'border-(--rmhbox-accent) cursor-crosshair'
            : 'border-(--rmhbox-border) cursor-not-allowed'
        }`}
        style={{ backgroundColor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Committed strokes */}
        {strokes.map((stroke) => (
          <line
            key={stroke.id}
            x1={stroke.points[0]?.x ?? 0}
            y1={stroke.points[0]?.y ?? 0}
            x2={stroke.points[1]?.x ?? stroke.points[0]?.x ?? 0}
            y2={stroke.points[1]?.y ?? stroke.points[0]?.y ?? 0}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
          />
        ))}

        {/* Preview line while placing */}
        {canDraw && previewStart && previewEnd && (
          <line
            x1={previewStart.x}
            y1={previewStart.y}
            x2={previewEnd.x}
            y2={previewEnd.y}
            stroke={selectedColor}
            strokeWidth={selectedWidth}
            strokeLinecap="round"
            opacity={0.5}
            strokeDasharray="6 4"
          />
        )}
      </svg>

      {/* Undo button */}
      {!hasSubmitted && strokes.length > 0 && (
        <button
          onClick={onUndo}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-(--rmhbox-surface)/80 border border-(--rmhbox-border) text-(--rmhbox-text) text-sm hover:bg-(--rmhbox-border) transition-colors"
          title="Undo last stroke"
          aria-label="Undo last stroke"
        >
          ↩
        </button>
      )}

      {/* Pending indicator */}
      {pendingStart && (
        <span className="absolute bottom-2 left-2 text-xs text-(--rmhbox-text-muted) bg-(--rmhbox-surface)/80 px-2 py-0.5 rounded">
          Click to place endpoint (Esc to cancel)
        </span>
      )}
    </div>
  );
}
