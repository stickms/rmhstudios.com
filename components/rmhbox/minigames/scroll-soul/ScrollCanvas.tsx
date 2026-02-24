/**
 * ScrollCanvas — HTML5 Canvas renderer for Scroll Soul.
 *
 * Draws the game field at ~60 fps using requestAnimationFrame:
 *   - Sky background gradient
 *   - Platforms (static=brown, moving=blue, shrinking=red)
 *   - Players (colored rectangles with names)
 *   - Lava zone (red/orange gradient at bottom)
 *   - Height markers every 200 world-units
 *
 * Camera follows viewportY. Uses client-side lerping between
 * 15 Hz server state updates to produce smooth visual movement.
 */
'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { SCPlayer, SCPlatform } from './ScrollSoulGame';

// ─── Constants ───────────────────────────────────────────────────

const PLAYER_WIDTH = 20;
const PLAYER_HEIGHT = 30;
const LERP_FACTOR = 0.2;
const HEIGHT_MARKER_INTERVAL = 200;

// ─── Helpers ─────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Props ───────────────────────────────────────────────────────

interface ScrollCanvasProps {
  players: SCPlayer[];
  platforms: SCPlatform[];
  viewportY: number;
  lavaY: number;
  myUserId: string;
  canvasWidth: number;
  canvasHeight: number;
}

// ─── Component ───────────────────────────────────────────────────

export default function ScrollCanvas({
  players,
  platforms,
  viewportY,
  lavaY,
  myUserId,
  canvasWidth,
  canvasHeight,
}: ScrollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Lerped positions for smooth rendering
  const lerpedPlayers = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lerpedViewportY = useRef(viewportY);

  // Keep target positions in sync with props
  const targetPlayers = useRef<SCPlayer[]>(players);
  const targetViewportY = useRef(viewportY);

  useEffect(() => {
    targetPlayers.current = players;
  }, [players]);

  useEffect(() => {
    targetViewportY.current = viewportY;
  }, [viewportY]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const draw = () => {
      // Lerp viewport
      lerpedViewportY.current = lerp(lerpedViewportY.current, targetViewportY.current, LERP_FACTOR);
      const camY = lerpedViewportY.current;

      // Lerp player positions
      for (const p of targetPlayers.current) {
        const prev = lerpedPlayers.current.get(p.userId) ?? { x: p.x, y: p.y };
        prev.x = lerp(prev.x, p.x, LERP_FACTOR);
        prev.y = lerp(prev.y, p.y, LERP_FACTOR);
        lerpedPlayers.current.set(p.userId, prev);
      }

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Sky background gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Height markers
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      const startMarker = Math.floor((camY - canvasHeight) / HEIGHT_MARKER_INTERVAL) * HEIGHT_MARKER_INTERVAL;
      for (let wy = startMarker; wy < camY + canvasHeight; wy += HEIGHT_MARKER_INTERVAL) {
        const sy = canvasHeight - (wy - camY);
        if (sy < 0 || sy > canvasHeight) continue;
        ctx.fillRect(0, sy, canvasWidth, 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillText(`${Math.abs(Math.round(wy))}`, canvasWidth - 4, sy - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      }

      // Platforms
      for (const plat of platforms) {
        const sx = plat.x;
        const sy = canvasHeight - (plat.y - camY);
        if (sy < -plat.height || sy > canvasHeight + plat.height) continue;

        switch (plat.type) {
          case 'moving':
            ctx.fillStyle = '#3b82f6';
            break;
          case 'shrinking':
            ctx.fillStyle = '#ef4444';
            break;
          default:
            ctx.fillStyle = '#92400e';
            break;
        }
        ctx.fillRect(sx, sy, plat.width, plat.height);

        // Platform edge highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(sx, sy, plat.width, 2);
      }

      // Lava zone
      const lavaSY = canvasHeight - (lavaY - camY);
      if (lavaSY < canvasHeight) {
        const lavaGrad = ctx.createLinearGradient(0, lavaSY, 0, canvasHeight);
        lavaGrad.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
        lavaGrad.addColorStop(0.4, 'rgba(249, 115, 22, 0.9)');
        lavaGrad.addColorStop(1, 'rgba(220, 38, 38, 1.0)');
        ctx.fillStyle = lavaGrad;
        ctx.fillRect(0, Math.max(lavaSY, 0), canvasWidth, canvasHeight - Math.max(lavaSY, 0));

        // Lava surface glow
        ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.fillRect(0, lavaSY - 2, canvasWidth, 4);
      }

      // Players
      for (const p of targetPlayers.current) {
        const pos = lerpedPlayers.current.get(p.userId) ?? { x: p.x, y: p.y };
        const sx = pos.x - PLAYER_WIDTH / 2;
        const sy = canvasHeight - (pos.y - camY) - PLAYER_HEIGHT;
        const isMe = p.userId === myUserId;

        if (sy < -PLAYER_HEIGHT || sy > canvasHeight + PLAYER_HEIGHT) continue;

        // Player body
        ctx.globalAlpha = p.alive ? 1.0 : 0.3;
        ctx.fillStyle = p.color;
        ctx.fillRect(sx, sy, PLAYER_WIDTH, PLAYER_HEIGHT);

        // Highlight ring for local player
        if (isMe) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(sx - 1, sy - 1, PLAYER_WIDTH + 2, PLAYER_HEIGHT + 2);
        }

        // Player name above
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.userName, pos.x, sy - 3);

        ctx.globalAlpha = 1.0;
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [canvasWidth, canvasHeight, platforms, lavaY, myUserId]);

  // DPR for high-DPI displays
  const dpr = useMemo(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), []);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth * dpr}
      height={canvasHeight * dpr}
      style={{
        width: Math.min(canvasWidth, 400),
        height: Math.min(canvasHeight, 600),
        borderRadius: 12,
        border: '1px solid var(--rmhbox-border)',
      }}
    />
  );
}
