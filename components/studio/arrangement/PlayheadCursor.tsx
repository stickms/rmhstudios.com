import { useRef, useEffect } from 'react';
import { useStudioStore } from '@/lib/studio/store';
import { getPixelsPerBeat } from '@/lib/studio/utils/grid';

interface PlayheadCursorProps {
  width: number;
  height: number;
}

/**
 * Animated playhead line rendered on a transparent canvas overlay.
 * Uses requestAnimationFrame for smooth 60fps animation during playback.
 * Receives explicit width/height from parent to avoid canvas size issues.
 */
export function PlayheadCursor({ width, height }: PlayheadCursorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawPlayhead = () => {
      const { currentBeat, zoomX, scrollX, isPlaying } = useStudioStore.getState();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.min(sizeRef.current.width, 4096);
      const h = sizeRef.current.height;

      if (w <= 0 || h <= 0) {
        rafRef.current = requestAnimationFrame(drawPlayhead);
        return;
      }

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, w, h);

      const ppb = getPixelsPerBeat(zoomX);
      const x = currentBeat * ppb - scrollX;

      if (x >= 0 && x <= w) {
        // Playhead line
        ctx.strokeStyle = isPlaying ? '#22d3ee' : '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        // Playhead triangle at top
        ctx.fillStyle = isPlaying ? '#22d3ee' : '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(x - 5, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x, 7);
        ctx.closePath();
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(drawPlayhead);
    };

    rafRef.current = requestAnimationFrame(drawPlayhead);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none sticky left-0 top-0"
      style={{ position: 'absolute', left: 0, top: 0, width, height }}
    />
  );
}
