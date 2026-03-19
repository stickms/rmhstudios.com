import { useRef, useCallback, useState } from 'react';

interface KnobControlProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  size?: number;
  label?: string;
  unit?: string;
  onChange: (value: number) => void;
  color?: string;
}

/**
 * SVG rotary knob with drag-to-adjust. Drag up to increase, down to decrease.
 */
export function KnobControl({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  size = 36,
  label,
  unit = '',
  onChange,
  color = '#22d3ee',
}: KnobControlProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; val: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const normalized = (value - min) / (max - min);
  const startAngle = -135;
  const endAngle = 135;
  const angle = startAngle + normalized * (endAngle - startAngle);

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;

  // Arc path for the value indicator
  const arcStart = (startAngle * Math.PI) / 180;
  const arcEnd = (angle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(arcStart - Math.PI / 2);
  const y1 = cy + r * Math.sin(arcStart - Math.PI / 2);
  const x2 = cx + r * Math.cos(arcEnd - Math.PI / 2);
  const y2 = cy + r * Math.sin(arcEnd - Math.PI / 2);
  const largeArc = angle - startAngle > 180 ? 1 : 0;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, val: value };
      setIsDragging(true);
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dy = dragStart.current.y - e.clientY;
      const sensitivity = e.shiftKey ? 0.001 : 0.005;
      const range = max - min;
      let newVal = dragStart.current.val + dy * sensitivity * range;
      newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    },
    [min, max, step, onChange],
  );

  const handlePointerUp = useCallback(() => {
    dragStart.current = null;
    setIsDragging(false);
  }, []);

  // Double-click to reset to center/default
  const handleDoubleClick = useCallback(() => {
    onChange(min + (max - min) / 2);
  }, [min, max, onChange]);

  const displayValue = step >= 1 ? Math.round(value) : value.toFixed(step < 0.1 ? 2 : 1);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        ref={knobRef}
        className="cursor-ns-resize select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.1)" strokeWidth={2} />

          {/* Value arc */}
          {normalized > 0.01 && (
            <path
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )}

          {/* Pointer line */}
          <line
            x1={cx}
            y1={cy}
            x2={cx + (r - 4) * Math.cos(arcEnd - Math.PI / 2)}
            y2={cy + (r - 4) * Math.sin(arcEnd - Math.PI / 2)}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Center dot */}
          <circle cx={cx} cy={cy} r={2} fill="rgba(255,255,255,0.3)" />
        </svg>
      </div>

      {isDragging && (
        <span className="text-[9px] tabular-nums text-cyan-400">
          {displayValue}{unit}
        </span>
      )}
      {label && !isDragging && (
        <span className="text-[9px] text-[var(--site-muted)]">{label}</span>
      )}
    </div>
  );
}
