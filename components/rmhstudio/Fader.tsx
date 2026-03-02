/**
 * Fader — Vertical slider for volume control.
 */
'use client';

import { useCallback, useRef, useState } from 'react';

interface FaderProps {
  value: number;    // 0–1
  height?: number;
  onChange: (value: number) => void;
  color?: string;
}

export default function Fader({
  value,
  height = 140,
  onChange,
  color = 'var(--rstudio-accent)',
}: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromEvent(e);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    updateFromEvent(e);
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const updateFromEvent = useCallback((e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const normalized = 1 - Math.max(0, Math.min(1, y / rect.height));
    onChange(Math.round(normalized * 100) / 100);
  }, [onChange]);

  const handleDoubleClick = useCallback(() => {
    onChange(0.8); // reset to default
  }, [onChange]);

  const fillHeight = value * 100;
  const thumbY = (1 - value) * (height - 6);

  return (
    <div
      ref={trackRef}
      className="rstudio-fader"
      style={{ height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="rstudio-fader-fill"
        style={{ height: `${fillHeight}%`, background: `${color}20` }}
      />
      <div
        className="rstudio-fader-thumb"
        style={{ top: thumbY, background: color }}
      />
    </div>
  );
}
