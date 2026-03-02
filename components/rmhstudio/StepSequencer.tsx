/**
 * StepSequencer — Canvas-based step grid.
 *
 * Rows = channels, columns = steps.
 * Click to toggle, right-click for velocity adjust.
 * Highlights the current playhead step during playback.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useStudioStore } from '@/lib/rmhstudio/store';

const ROW_HEIGHT = 32;
const CELL_PAD = 2;
const BEAT_GAP = 4;    // extra gap every 4 steps
const HEADER_HEIGHT = 0;

export default function StepSequencer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // We read from the store on every frame for smooth animation
  const storeRef = useRef(useStudioStore.getState());
  useEffect(() => {
    const unsub = useStudioStore.subscribe(s => { storeRef.current = s; });
    return unsub;
  }, []);

  // ─── Resize canvas to fill container ─────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  // ─── Draw loop ────────────────────────────────────────────────
  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const state = storeRef.current;
      const pattern = state.patterns.find(p => p.id === state.currentPatternId);
      if (!pattern) { animRef.current = requestAnimationFrame(draw); return; }

      const { channels, currentStep, isPlaying } = state;
      const stepCount = pattern.stepCount;
      const rowCount = channels.length;

      // Calculate cell width
      const totalBeatGaps = Math.floor((stepCount - 1) / 4) * BEAT_GAP;
      const availWidth = w - totalBeatGaps;
      const cellW = availWidth / stepCount;

      // Draw grid
      for (let row = 0; row < rowCount; row++) {
        const y = HEADER_HEIGHT + row * ROW_HEIGHT;

        for (let col = 0; col < stepCount; col++) {
          const beatOffset = Math.floor(col / 4) * BEAT_GAP;
          const x = col * cellW + beatOffset;

          const step = pattern.steps[row]?.[col];
          const isActive = step?.active ?? false;
          const velocity = step?.velocity ?? 0.8;
          const isCurrentStep = isPlaying && col === currentStep;

          // Cell background
          if (isCurrentStep) {
            ctx.fillStyle = 'rgba(155, 122, 216, 0.15)';
          } else if (col % 8 < 4) {
            ctx.fillStyle = '#181a24';
          } else {
            ctx.fillStyle = '#1e2030';
          }
          ctx.fillRect(
            x + CELL_PAD,
            y + CELL_PAD,
            cellW - CELL_PAD * 2,
            ROW_HEIGHT - CELL_PAD * 2,
          );

          // Active step
          if (isActive) {
            const color = channels[row]?.color ?? '#9b7ad8';
            const alpha = 0.3 + velocity * 0.7;
            ctx.fillStyle = hexToRgba(color, alpha);
            ctx.beginPath();
            ctx.roundRect(
              x + CELL_PAD + 1,
              y + CELL_PAD + 1,
              cellW - CELL_PAD * 2 - 2,
              ROW_HEIGHT - CELL_PAD * 2 - 2,
              3,
            );
            ctx.fill();
          }

          // Playhead line
          if (isCurrentStep) {
            ctx.fillStyle = 'rgba(155, 122, 216, 0.5)';
            ctx.fillRect(x + CELL_PAD, y, 2, ROW_HEIGHT);
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [resize]);

  // ─── Mouse interaction ────────────────────────────────────────
  const getCellFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const state = storeRef.current;
    const pattern = state.patterns.find(p => p.id === state.currentPatternId);
    if (!pattern) return null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const stepCount = pattern.stepCount;
    const totalBeatGaps = Math.floor((stepCount - 1) / 4) * BEAT_GAP;
    const cellW = (w - totalBeatGaps) / stepCount;

    const row = Math.floor((my - HEADER_HEIGHT) / ROW_HEIGHT);
    if (row < 0 || row >= state.channels.length) return null;

    // Find column accounting for beat gaps
    let col = -1;
    let cumX = 0;
    for (let c = 0; c < stepCount; c++) {
      const beatOffset = (c > 0 && c % 4 === 0) ? BEAT_GAP : 0;
      cumX += beatOffset;
      if (mx >= cumX && mx < cumX + cellW) {
        col = c;
        break;
      }
      cumX += cellW;
    }
    if (col < 0) return null;

    return { row, col };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const cell = getCellFromEvent(e);
    if (!cell) return;
    useStudioStore.getState().toggleStep(cell.row, cell.col);
  }, [getCellFromEvent]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;
    // Cycle velocity: 0.25 → 0.5 → 0.75 → 1.0 → 0.25
    const state = storeRef.current;
    const pattern = state.patterns.find(p => p.id === state.currentPatternId);
    if (!pattern) return;
    const step = pattern.steps[cell.row]?.[cell.col];
    if (!step) return;
    if (!step.active) {
      useStudioStore.getState().toggleStep(cell.row, cell.col);
      return;
    }
    const velocities = [0.25, 0.5, 0.75, 1.0];
    const currentIdx = velocities.findIndex(v => Math.abs(v - step.velocity) < 0.05);
    const nextVel = velocities[(currentIdx + 1) % velocities.length];
    useStudioStore.getState().setStepVelocity(cell.row, cell.col, nextVel);
  }, [getCellFromEvent]);

  return (
    <div ref={containerRef} className="rstudio-sequencer">
      <canvas
        ref={canvasRef}
        className="rstudio-sequencer-canvas"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'pointer' }}
      />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
