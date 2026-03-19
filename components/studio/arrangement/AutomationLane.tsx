import { useRef, useEffect, useCallback } from 'react';
import { useStudioStore } from '@/lib/studio/store';
import { getPixelsPerBeat, snapToGrid, pixelToBeat } from '@/lib/studio/utils/grid';
import type { AutomationClipData, AutomationPoint } from '@/lib/studio/types';

interface AutomationLaneProps {
  clip: AutomationClipData;
  width: number;
  height: number;
}

/**
 * Canvas-rendered automation lane showing breakpoint envelope.
 */
export function AutomationLane({ clip, width, height }: AutomationLaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { zoomX, scrollX, updateClip, snapEnabled, snapValue } = useStudioStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const ppb = getPixelsPerBeat(zoomX);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const points = clip.breakpoints;
    if (points.length === 0) return;

    // Sort by beat
    const sorted = [...points].sort((a, b) => a.beat - b.beat);

    // Draw automation line
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < sorted.length; i++) {
      const pt = sorted[i];
      const x = pt.beat * ppb - scrollX;
      const y = (1 - pt.value) * height;

      if (i === 0) {
        // Extend to left edge
        ctx.moveTo(0, y);
        ctx.lineTo(x, y);
      } else {
        const prev = sorted[i - 1];
        const prevX = prev.beat * ppb - scrollX;
        const prevY = (1 - prev.value) * height;

        if (pt.curve === 'step') {
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    }

    // Extend to right edge
    const lastY = (1 - sorted[sorted.length - 1].value) * height;
    ctx.lineTo(width, lastY);
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
    ctx.fill();

    // Draw breakpoint handles
    for (const pt of sorted) {
      const x = pt.beat * ppb - scrollX;
      const y = (1 - pt.value) * height;

      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [clip, width, height, zoomX, scrollX]);

  useEffect(() => { draw(); }, [draw]);

  // Click to add/move breakpoints
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ppb = getPixelsPerBeat(zoomX);
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const beat = snapToGrid(pixelToBeat(clickX, ppb, scrollX), snapValue, snapEnabled);
    const value = 1 - clickY / height;

    const newPoint: AutomationPoint = {
      beat: Math.max(0, beat),
      value: Math.max(0, Math.min(1, value)),
      curve: 'linear',
    };

    // Check if clicking near an existing point (to remove it)
    const existing = clip.breakpoints.find((pt) => {
      const px = pt.beat * ppb - scrollX;
      const py = (1 - pt.value) * height;
      return Math.abs(clickX - px) < 8 && Math.abs(clickY - py) < 8;
    });

    if (existing && e.button === 2) {
      // Right-click to remove
      updateClip(clip.id, {
        breakpoints: clip.breakpoints.filter((pt) => pt !== existing),
      } as any);
    } else {
      updateClip(clip.id, {
        breakpoints: [...clip.breakpoints, newPoint],
      } as any);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="cursor-crosshair"
      style={{ width, height }}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); handleClick(e); }}
    />
  );
}
