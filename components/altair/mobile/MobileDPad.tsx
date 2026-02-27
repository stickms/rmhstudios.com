/**
 * MobileDPad — Virtual joystick for mobile movement.
 */
'use client';

import { useRef, useCallback } from 'react';

interface MobileDPadProps {
  onChange: (dx: number, dy: number) => void;
}

export default function MobileDPad({ onChange }: MobileDPadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);

  const handleTouch = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const pad = padRef.current;
      if (!pad) return;

      const rect = pad.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const touch = e.touches[0];
      if (!touch) {
        onChange(0, 0);
        return;
      }

      const rawDx = (touch.clientX - centerX) / (rect.width / 2);
      const rawDy = (touch.clientY - centerY) / (rect.height / 2);
      const len = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
      const capped = Math.min(len, 1);
      const dx = len > 0.1 ? (rawDx / len) * capped : 0;
      const dy = len > 0.1 ? (rawDy / len) * capped : 0;

      onChange(dx, dy);
      activeRef.current = true;
    },
    [onChange]
  );

  const handleEnd = useCallback(() => {
    onChange(0, 0);
    activeRef.current = false;
  }, [onChange]);

  return (
    <div className="absolute bottom-8 left-8 z-40 pointer-events-auto">
      <div
        ref={padRef}
        className="w-32 h-32 rounded-full border-2 border-white/20 bg-black/30 backdrop-blur-sm flex items-center justify-center touch-none"
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      >
        <div className="w-12 h-12 rounded-full bg-white/20 border border-white/30" />
      </div>
    </div>
  );
}
