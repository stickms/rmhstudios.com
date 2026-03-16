import { useRef, useCallback, useState } from 'react';

interface FaderControlProps {
  value: number; // 0–1
  onChange: (value: number) => void;
  height?: number;
  width?: number;
  label?: string;
  color?: string;
}

/**
 * Vertical fader control with drag interaction.
 */
export function FaderControl({
  value,
  onChange,
  height = 100,
  width = 24,
  label,
  color = '#22d3ee',
}: FaderControlProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const thumbHeight = 12;
  const trackHeight = height - thumbHeight;
  const thumbY = (1 - value) * trackHeight;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      updateFromPointer(e);
    },
    [],
  );

  const updateFromPointer = (e: React.PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top - thumbHeight / 2;
    const newVal = 1 - Math.max(0, Math.min(1, y / trackHeight));
    onChange(newVal);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateFromPointer(e);
    },
    [isDragging],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const dbValue = value > 0 ? (20 * Math.log10(value)).toFixed(1) : '-∞';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={trackRef}
        className="relative cursor-ns-resize rounded-sm bg-black/40"
        style={{ width, height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b-sm"
          style={{
            height: `${value * 100}%`,
            backgroundColor: color + '30',
          }}
        />

        {/* dB markers */}
        {[0, 0.25, 0.5, 0.75, 1].map((mark) => (
          <div
            key={mark}
            className="absolute left-0 right-0 border-t border-white/5"
            style={{ top: `${(1 - mark) * 100}%` }}
          />
        ))}

        {/* Thumb */}
        <div
          className="absolute left-0 right-0 rounded-sm border border-white/30"
          style={{
            top: thumbY,
            height: thumbHeight,
            backgroundColor: isDragging ? color : 'rgba(255,255,255,0.15)',
            boxShadow: isDragging ? `0 0 6px ${color}40` : 'none',
          }}
        />
      </div>

      <span className="text-[9px] tabular-nums text-[var(--site-muted)]">
        {dbValue} dB
      </span>
      {label && (
        <span className="max-w-[50px] truncate text-[9px] text-[var(--site-muted)]">{label}</span>
      )}
    </div>
  );
}
