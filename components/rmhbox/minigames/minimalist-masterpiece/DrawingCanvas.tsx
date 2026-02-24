/**
 * DrawingCanvas — Pointer-event-based drawing surface.
 *
 * Captures pointer events to build strokes. Each stroke is recorded
 * as a series of { x, y, pressure } points. Drawing is disabled
 * once the stroke limit is reached or the drawing has been submitted.
 */
'use client';

import { useRef, useCallback } from 'react';
import type { MMStroke } from './DrawingCard';

interface DrawingCanvasProps {
  strokes: MMStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<MMStroke[]>>;
  selectedColor: string;
  maxStrokes: number;
  hasSubmitted: boolean;
  onSubmit: () => void;
}

export default function DrawingCanvas({
  strokes,
  setStrokes,
  selectedColor,
  maxStrokes,
  hasSubmitted,
}: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDrawing = useRef(false);
  const currentStrokeId = useRef<string | null>(null);

  const canDraw = !hasSubmitted && strokes.length < maxStrokes;

  const getPoint = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0, pressure: 0.5 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 300,
      y: ((e.clientY - rect.top) / rect.height) * 300,
      pressure: e.pressure || 0.5,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!canDraw) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      isDrawing.current = true;
      const id = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      currentStrokeId.current = id;
      const point = getPoint(e);
      setStrokes((prev) => [
        ...prev,
        { id, points: [point], color: selectedColor, width: 3, timestamp: Date.now() },
      ]);
    },
    [canDraw, getPoint, selectedColor, setStrokes],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawing.current || !currentStrokeId.current) return;
      const point = getPoint(e);
      setStrokes((prev) =>
        prev.map((s) =>
          s.id === currentStrokeId.current
            ? { ...s, points: [...s.points, point] }
            : s,
        ),
      );
    },
    [getPoint, setStrokes],
  );

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
    currentStrokeId.current = null;
  }, []);

  // Build path data from points
  const strokeToPath = (stroke: MMStroke): string => {
    if (stroke.points.length === 0) return '';
    const [first, ...rest] = stroke.points;
    let d = `M ${first.x} ${first.y}`;
    for (const pt of rest) {
      d += ` L ${pt.x} ${pt.y}`;
    }
    return d;
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox="0 0 300 300"
        className={`w-72 h-72 rounded-lg border-2 bg-white touch-none ${
          canDraw
            ? 'border-(--rmhbox-accent) cursor-crosshair'
            : 'border-(--rmhbox-border) cursor-not-allowed'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {strokes.map((stroke) => (
          <path
            key={stroke.id}
            d={strokeToPath(stroke)}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </svg>
    </div>
  );
}
