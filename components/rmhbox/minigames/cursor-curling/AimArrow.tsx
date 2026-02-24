/**
 * AimArrow — Directional aim indicator for the Cursor Curling minigame.
 *
 * Shows a directional arrow from the launch position that follows
 * the mouse or touch position. Restricts aim to ±90° from vertical.
 * Click/tap to lock in the angle and submit to parent.
 */
'use client';

import { useState, useCallback, useRef } from 'react';

interface AimArrowProps {
  onSubmit: (angle: number) => void;
  timeRemaining: number;
}

const CLAMP = Math.PI / 2; // ±90° from vertical

export default function AimArrow({ onSubmit, timeRemaining }: AimArrowProps) {
  const [angle, setAngle] = useState(0);
  const [locked, setLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (locked) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Origin at bottom center
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height;
      const dx = e.clientX - originX;
      const dy = originY - e.clientY;

      if (dy <= 0) return; // Ignore below origin
      const raw = Math.atan2(dx, dy);
      const clamped = Math.max(-CLAMP, Math.min(CLAMP, raw));
      setAngle(clamped);
    },
    [locked],
  );

  const handleClick = useCallback(() => {
    if (locked) return;
    setLocked(true);
    onSubmit(angle);
  }, [locked, angle, onSubmit]);

  // Arrow endpoint for SVG display
  const arrowLen = 80;
  const endX = 100 + Math.sin(angle) * arrowLen;
  const endY = 100 - Math.cos(angle) * arrowLen;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        className={`relative cursor-crosshair select-none rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) ${
          locked ? 'opacity-60 pointer-events-none' : ''
        }`}
        style={{ width: 200, height: 100, touchAction: 'none' }}
      >
        <svg width={200} height={100} className="absolute inset-0">
          {/* Origin dot */}
          <circle cx={100} cy={100} r={4} fill="var(--rmhbox-accent, #6366f1)" />
          {/* Arrow line */}
          <line
            x1={100}
            y1={100}
            x2={endX}
            y2={endY}
            stroke={locked ? '#22c55e' : 'var(--rmhbox-accent, #6366f1)'}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Arrowhead */}
          <circle cx={endX} cy={endY} r={5} fill={locked ? '#22c55e' : 'var(--rmhbox-accent, #6366f1)'} />
        </svg>
      </div>
      <p className="text-xs text-(--rmhbox-text-muted)">
        {locked
          ? `Angle locked: ${Math.round((angle * 180) / Math.PI)}°`
          : `Move to aim, click to lock (${timeRemaining}s)`}
      </p>
    </div>
  );
}
