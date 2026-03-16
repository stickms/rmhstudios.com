import { useRef, useEffect, useCallback } from 'react';
import { useStudioStore } from '@/lib/studio/store';
import { getPixelsPerBeat } from '@/lib/studio/utils/grid';

interface TimeRulerProps {
  width: number;
  trackHeaderWidth: number;
}

export function TimeRuler({ width, trackHeaderWidth }: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { zoomX, scrollX, timeSignature, loopEnabled, loopStart, loopEnd, bpm } = useStudioStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rulerWidth = width - trackHeaderWidth;
    canvas.width = rulerWidth * dpr;
    canvas.height = 28 * dpr;
    canvas.style.width = `${rulerWidth}px`;
    canvas.style.height = '28px';
    ctx.scale(dpr, dpr);

    const ppb = getPixelsPerBeat(zoomX);
    const beatsPerBar = timeSignature[0];
    const startBeat = scrollX / ppb;
    const endBeat = (scrollX + rulerWidth) / ppb;

    // Background
    ctx.fillStyle = 'var(--site-surface, #1a1a2e)';
    ctx.fillRect(0, 0, rulerWidth, 28);

    // Loop region
    if (loopEnabled) {
      const loopStartPx = loopStart * ppb - scrollX;
      const loopEndPx = loopEnd * ppb - scrollX;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
      ctx.fillRect(loopStartPx, 0, loopEndPx - loopStartPx, 28);
      // Loop markers
      ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
      ctx.fillRect(loopStartPx, 0, 2, 28);
      ctx.fillRect(loopEndPx - 2, 0, 2, 28);
    }

    // Determine grid subdivision based on zoom
    let subdivBeats = beatsPerBar; // default: show bar lines
    if (ppb > 20) subdivBeats = 1; // show beat lines
    if (ppb > 60) subdivBeats = 0.5; // show 8th note lines
    if (ppb > 120) subdivBeats = 0.25; // show 16th note lines

    // Grid lines and labels
    const firstBeat = Math.floor(startBeat / subdivBeats) * subdivBeats;
    for (let beat = firstBeat; beat <= endBeat; beat += subdivBeats) {
      const x = beat * ppb - scrollX;
      if (x < 0) continue;

      const isBar = Math.abs(beat % beatsPerBar) < 0.001;
      const isBeat = Math.abs(beat % 1) < 0.001;

      if (isBar) {
        // Bar line — tall, with label
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x, 28);
        ctx.stroke();

        const barNum = Math.round(beat / beatsPerBar) + 1;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(`${barNum}`, x + 4, 11);
      } else if (isBeat) {
        // Beat line — medium
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, 28);
        ctx.stroke();
      } else {
        // Sub-beat — short tick
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 24);
        ctx.lineTo(x, 28);
        ctx.stroke();
      }
    }

    // Bottom border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 27.5);
    ctx.lineTo(rulerWidth, 27.5);
    ctx.stroke();
  }, [width, trackHeaderWidth, zoomX, scrollX, timeSignature, loopEnabled, loopStart, loopEnd]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ppb = getPixelsPerBeat(zoomX);
    const clickBeat = (e.clientX - rect.left + scrollX) / ppb;
    useStudioStore.getState().setCurrentBeat(Math.max(0, clickBeat));
  };

  return (
    <div className="flex h-7 shrink-0">
      {/* Track header spacer */}
      <div
        className="shrink-0 border-b border-r border-[var(--site-border)] bg-[var(--site-surface)]"
        style={{ width: trackHeaderWidth }}
      />
      {/* Ruler canvas */}
      <canvas
        ref={canvasRef}
        className="cursor-pointer border-b border-[var(--site-border)]"
        onClick={handleClick}
      />
    </div>
  );
}
