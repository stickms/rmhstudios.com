/**
 * SwipeDetector — Mobile swipe and desktop arrow key handler.
 *
 * Detects directional input from:
 *   - Touch swipe gestures (mobile)
 *   - Arrow key presses (desktop)
 *
 * Rate-limited to 6 moves per second to match server throttle.
 * Prevents default scroll behavior during active swipes.
 */
'use client';

import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { HT_MOVE_RATE_LIMIT } from '@/lib/rmhbox/constants';

export type Direction = 'up' | 'down' | 'left' | 'right';

interface SwipeDetectorProps {
  onMove: (direction: Direction) => void;
  enabled: boolean;
  children: ReactNode;
}

const MIN_SWIPE_DISTANCE = 30;
const MOVE_INTERVAL_MS = 1000 / HT_MOVE_RATE_LIMIT;

export default function SwipeDetector({ onMove, enabled, children }: SwipeDetectorProps) {
  const lastMoveTime = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const throttledMove = useCallback(
    (direction: Direction) => {
      if (!enabled) return;
      const now = Date.now();
      if (now - lastMoveTime.current < MOVE_INTERVAL_MS) return;
      lastMoveTime.current = now;
      onMove(direction);
    },
    [onMove, enabled],
  );

  // Keyboard handler
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const dirMap: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
      };
      const dir = dirMap[e.key];
      if (dir) {
        e.preventDefault();
        throttledMove(dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, throttledMove]);

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    },
    [enabled],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      // Prevent scrolling during active swipe
      e.preventDefault();
    },
    [enabled],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) < MIN_SWIPE_DISTANCE) {
        touchStart.current = null;
        return;
      }

      let dir: Direction;
      if (absDx > absDy) {
        dir = dx > 0 ? 'right' : 'left';
      } else {
        dir = dy > 0 ? 'down' : 'up';
      }
      throttledMove(dir);
      touchStart.current = null;
    },
    [enabled, throttledMove],
  );

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full h-full"
      style={{ touchAction: enabled ? 'none' : 'auto' }}
    >
      {children}
    </div>
  );
}
