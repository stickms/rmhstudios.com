/**
 * CurlingCanvas — HTML5 Canvas rendering for the Cursor Curling rink.
 *
 * Draws the curling house (concentric rings), rink walls, and all
 * stones currently on the ice. Interpolates stone positions between
 * server ticks (30Hz) for smooth 60fps rendering via requestAnimationFrame.
 *
 * Canvas is 400×600 logical pixels, scaled to fit the container.
 */
'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { StoneState } from './CursorCurlingGame';

// ─── Constants ───────────────────────────────────────────────────

const CANVAS_W = 400;
const CANVAS_H = 600;
const HOUSE_X = CANVAS_W / 2;
const HOUSE_Y = 150;
const RING_RADII = [60, 45, 30, 10]; // 4-foot, 8-foot, 12-foot, button
const RING_COLORS = ['#3b82f6', '#ffffff', '#ef4444', '#ffffff'];
const WALL_COLOR = '#64748b';
const ICE_COLOR = '#e2e8f0';
const STONE_RADIUS = 10;
const LAUNCH_Y = CANVAS_H - 60;

interface CurlingCanvasProps {
  stones: StoneState[];
  activeStoneId: string | null;
  aimAngle?: number;
}

export default function CurlingCanvas({ stones, activeStoneId, aimAngle }: CurlingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevStones = useRef<StoneState[]>([]);
  const interpStones = useRef<StoneState[]>([]);
  const lastTickTime = useRef(performance.now());
  const rafId = useRef<number>(0);

  // Update interpolation targets when stones change
  useEffect(() => {
    prevStones.current = interpStones.current.length ? [...interpStones.current] : [...stones];
    interpStones.current = [...stones];
    lastTickTime.current = performance.now();
  }, [stones]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const now = performance.now();
      const elapsed = now - lastTickTime.current;
      // Interpolation factor (server ticks at ~33ms = 30Hz)
      const t = Math.min(elapsed / 33, 1);

      // Clear
      ctx.fillStyle = ICE_COLOR;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Walls
      ctx.strokeStyle = WALL_COLOR;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);

      // Center line
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(HOUSE_X, 0);
      ctx.lineTo(HOUSE_X, CANVAS_H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hog line
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, CANVAS_H - 180);
      ctx.lineTo(CANVAS_W - 20, CANVAS_H - 180);
      ctx.stroke();

      // House rings
      for (let i = 0; i < RING_RADII.length; i++) {
        ctx.beginPath();
        ctx.arc(HOUSE_X, HOUSE_Y, RING_RADII[i], 0, Math.PI * 2);
        ctx.fillStyle = RING_COLORS[i];
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Launch position marker
      ctx.fillStyle = '#94a3b8';
      ctx.globalAlpha = 0.3;
      ctx.fillRect(HOUSE_X - 20, LAUNCH_Y - 2, 40, 4);
      ctx.globalAlpha = 1;

      // Aim line (during aiming phase)
      if (aimAngle !== undefined && aimAngle !== 0) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(HOUSE_X, LAUNCH_Y);
        const lineLen = 120;
        ctx.lineTo(
          HOUSE_X + Math.sin(aimAngle) * lineLen,
          LAUNCH_Y - Math.cos(aimAngle) * lineLen,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Stones with interpolation
      const prev = prevStones.current;
      const curr = interpStones.current;

      for (let i = 0; i < curr.length; i++) {
        const cs = curr[i];
        const ps = prev.find((s) => s.id === cs.id);
        const x = ps ? ps.x + (cs.x - ps.x) * t : cs.x;
        const y = ps ? ps.y + (cs.y - ps.y) * t : cs.y;

        // Trail for moving stones
        if (cs.moving) {
          ctx.beginPath();
          ctx.arc(x, y, STONE_RADIUS + 3, 0, Math.PI * 2);
          ctx.fillStyle = cs.color;
          ctx.globalAlpha = 0.15;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Stone body
        ctx.beginPath();
        ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = cs.color || '#6366f1';
        ctx.fill();
        ctx.strokeStyle = cs.id === activeStoneId ? '#fbbf24' : '#1e293b';
        ctx.lineWidth = cs.id === activeStoneId ? 2.5 : 1.5;
        ctx.stroke();

        // Player initial on stone
        const initial = cs.playerId?.charAt(0)?.toUpperCase() ?? '?';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, x, y);
      }
    },
    [activeStoneId, aimAngle],
  );

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function loop() {
      draw(ctx!);
      rafId.current = requestAnimationFrame(loop);
    }
    rafId.current = requestAnimationFrame(loop);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className="w-full max-w-[400px] rounded-lg border border-(--rmhbox-border)"
      style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
    />
  );
}
