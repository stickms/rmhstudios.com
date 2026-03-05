/**
 * MobileDPad — Virtual joystick for mobile movement.
 */
'use client';

import { useRef, useCallback, useEffect } from 'react';

interface MobileDPadProps {
  onChange: (dx: number, dy: number) => void;
  side?: 'left' | 'right';
}

export default function MobileDPad({ onChange, side = 'left' }: MobileDPadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);

  // Keep callback ref fresh without re-creating touch handlers
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const pad = padRef.current;
    const thumb = thumbRef.current;
    if (!pad || !thumb) return;

    const touch = e.touches[0];
    if (!touch) {
      onChangeRef.current(0, 0);
      thumb.style.transform = 'translate(0px, 0px)';
      return;
    }

    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rawDx = (touch.clientX - centerX) / (rect.width / 2);
    const rawDy = (touch.clientY - centerY) / (rect.height / 2);
    const len = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const capped = Math.min(len, 1);
    const dx = len > 0.1 ? (rawDx / len) * capped : 0;
    const dy = len > 0.1 ? (rawDy / len) * capped : 0;

    // Update thumb position directly on the DOM element (no React re-render)
    const maxTravel = 40;
    const thumbX = len > 0 ? (rawDx / len) * capped * maxTravel : 0;
    const thumbY = len > 0 ? (rawDy / len) * capped * maxTravel : 0;
    thumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;

    onChangeRef.current(dx, dy);
  }, []);

  const handleEnd = useCallback(() => {
    onChangeRef.current(0, 0);
    const thumb = thumbRef.current;
    if (thumb) thumb.style.transform = 'translate(0px, 0px)';
  }, []);

  return (
    <div
      className="absolute z-40 pointer-events-auto"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
        left: side === 'left' ? 'calc(env(safe-area-inset-left, 0px) + 32px)' : undefined,
        right: side === 'right' ? 'calc(env(safe-area-inset-right, 0px) + 32px)' : undefined,
      }}
    >
      <div
        ref={padRef}
        className="w-32 h-32 rounded-full border-2 border-white/20 bg-black/30 backdrop-blur-sm flex items-center justify-center touch-none"
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      >
        <div
          ref={thumbRef}
          className="w-12 h-12 rounded-full bg-white/20 border border-white/30"
          style={{ willChange: 'transform' }}
        />
      </div>
    </div>
  );
}
