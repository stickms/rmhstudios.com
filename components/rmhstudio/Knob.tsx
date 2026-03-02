/**
 * Knob — SVG rotary knob with vertical mouse drag.
 */
'use client';

import { useCallback, useRef, useState } from 'react';

interface KnobProps {
  value: number;      // current value
  min?: number;
  max?: number;
  step?: number;
  size?: number;      // px
  label?: string;
  color?: string;
  onChange: (value: number) => void;
}

export default function Knob({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  size = 36,
  label,
  color = 'var(--rstudio-accent)',
  onChange,
}: KnobProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startY: 0, startValue: 0 });

  const range = max - min;
  const normalized = (value - min) / range; // 0–1
  const angle = -135 + normalized * 270;    // -135° to +135°

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;

  // Arc path for the value indicator
  const startAngle = -135;
  const endAngle = angle;
  const arcPath = describeArc(cx, cy, r, startAngle, endAngle);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startValue: value };
    setDragging(true);
  }, [value]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dy = dragRef.current.startY - e.clientY;
    const sensitivity = e.shiftKey ? 0.001 : 0.005;
    const delta = dy * range * sensitivity;
    const newVal = Math.round(
      Math.max(min, Math.min(max, dragRef.current.startValue + delta)) / step,
    ) * step;
    onChange(newVal);
  }, [dragging, range, min, max, step, onChange]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Reset to center
    onChange(min + range / 2);
  }, [min, range, onChange]);

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ width: size }}
    >
      <svg
        width={size}
        height={size}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        {/* Background track */}
        <path
          d={describeArc(cx, cy, r, -135, 135)}
          fill="none"
          stroke="var(--rstudio-border)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {normalized > 0.005 && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
        {/* Pointer line */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + (r - 4) * Math.cos((angle - 90) * Math.PI / 180)}
          y2={cy + (r - 4) * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="var(--rstudio-text)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill="var(--rstudio-text-dim)" />
      </svg>
      {label && (
        <span
          className="text-center leading-none"
          style={{ fontSize: 9, color: 'var(--rstudio-text-dim)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// ─── SVG Arc Helper ────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
