/**
 * PowerMeter — Power selection component for the Cursor Curling minigame.
 *
 * Displays an oscillating bar that cycles green→yellow→red→yellow→green.
 * Click or tap to lock in the current power level (0–1).
 * Provides visual feedback when power is locked.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PowerMeterProps {
  onSubmit: (power: number) => void;
  locked: number | null;
}

const CYCLE_SPEED = 1.8; // Full cycles per second

function getPowerColor(p: number): string {
  if (p < 0.3) return '#22c55e';
  if (p < 0.6) return '#eab308';
  return '#ef4444';
}

export default function PowerMeter({ onSubmit, locked }: PowerMeterProps) {
  const [power, setPower] = useState(0);
  const rafRef = useRef<number>(0);
  const startTime = useRef(performance.now());

  useEffect(() => {
    if (locked !== null) return;

    function tick() {
      const elapsed = (performance.now() - startTime.current) / 1000;
      // Triangle wave: 0→1→0→1… 
      const cycle = (elapsed * CYCLE_SPEED) % 1;
      const val = cycle <= 0.5 ? cycle * 2 : 2 - cycle * 2;
      setPower(val);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [locked]);

  const handleClick = useCallback(() => {
    if (locked !== null) return;
    onSubmit(power);
  }, [locked, power, onSubmit]);

  const displayPower = locked ?? power;
  const pct = Math.round(displayPower * 100);
  const color = getPowerColor(displayPower);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={locked !== null}
        className={`relative h-8 w-64 overflow-hidden rounded-full border-2 transition-colors ${
          locked !== null
            ? 'border-(--rmhbox-accent) cursor-default'
            : 'border-(--rmhbox-border) cursor-pointer hover:border-(--rmhbox-text-muted)'
        }`}
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-(--rmhbox-surface)" />
        {/* Power fill */}
        <div
          className="absolute left-0 top-0 h-full transition-none rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            opacity: locked !== null ? 0.7 : 1,
          }}
        />
        {/* Power text */}
        <span className="relative z-10 text-xs font-bold text-white mix-blend-difference">
          {pct}%
        </span>
      </button>
      <p className="text-xs text-(--rmhbox-text-muted)">
        {locked !== null ? `Power locked: ${pct}%` : 'Click to set power!'}
      </p>
    </div>
  );
}
