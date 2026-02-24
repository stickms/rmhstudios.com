/**
 * SweepOverlay — Sweep interaction component for the Cursor Curling minigame.
 *
 * Detects rapid cursor or touch movement and sends SWEEP actions via
 * socket at up to 15Hz. Shows visual sweep feedback with a brush indicator
 * near the active stone.
 */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SweepOverlayProps {
  active: boolean;
  canSweep: boolean;
  onSweep: (intensity: number) => void;
}

const EMIT_INTERVAL = 67; // ~15Hz
const MOVEMENT_THRESHOLD = 5; // Minimum pixels to register movement

export default function SweepOverlay({ active, canSweep, onSweep }: SweepOverlayProps) {
  const [sweepIntensity, setSweepIntensity] = useState(0);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const movement = useRef(0);
  const lastEmit = useRef(0);
  const decayRef = useRef<number>(0);

  // Decay sweep intensity over time
  useEffect(() => {
    if (!active) return;

    function decay() {
      setSweepIntensity((prev) => {
        const next = prev * 0.92;
        return next < 0.01 ? 0 : next;
      });
      movement.current *= 0.9;
      decayRef.current = requestAnimationFrame(decay);
    }
    decayRef.current = requestAnimationFrame(decay);

    return () => {
      if (decayRef.current) cancelAnimationFrame(decayRef.current);
    };
  }, [active]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active || !canSweep) return;

      const now = performance.now();
      const pos = { x: e.clientX, y: e.clientY };

      if (lastPos.current) {
        const dx = pos.x - lastPos.current.x;
        const dy = pos.y - lastPos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > MOVEMENT_THRESHOLD) {
          movement.current = Math.min(movement.current + dist, 200);
          const intensity = Math.min(movement.current / 100, 1);
          setSweepIntensity(intensity);

          // Rate-limit emissions to 15Hz
          if (now - lastEmit.current >= EMIT_INTERVAL) {
            onSweep(intensity);
            lastEmit.current = now;
          }
        }
      }

      lastPos.current = pos;
    },
    [active, canSweep, onSweep],
  );

  if (!active) return null;

  return (
    <div
      onPointerMove={handlePointerMove}
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none', cursor: canSweep ? 'grab' : 'default' }}
    >
      {canSweep && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          {/* Sweep intensity bar */}
          <div className="h-2 w-32 overflow-hidden rounded-full bg-(--rmhbox-surface) border border-(--rmhbox-border)">
            <motion.div
              className="h-full rounded-full bg-(--rmhbox-accent)"
              animate={{ width: `${sweepIntensity * 100}%` }}
              transition={{ duration: 0.05 }}
            />
          </div>
          <p className="text-[10px] text-(--rmhbox-text-muted)">
            {sweepIntensity > 0.1 ? '🧹 Sweeping!' : 'Move cursor rapidly to sweep'}
          </p>
        </div>
      )}
    </div>
  );
}
