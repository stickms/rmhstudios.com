/**
 * GameCanvas — HTML5 Canvas renderer for Pixel Pushers.
 *
 * Draws the game field at ~60 fps using requestAnimationFrame:
 *   - Walls (dark gray rectangles)
 *   - Goal zone (green rectangle)
 *   - Waypoints (colored circles with index numbers)
 *   - Ball (gray circle)
 *   - Pushers (colored circles with player initials)
 *
 * Uses client-side lerping between 15 Hz server state updates
 * to produce smooth visual movement.
 */
'use client';

import { useRef, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────

interface Vec2 {
  x: number;
  y: number;
}

interface Pusher {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
  polarityFlipped: boolean;
}

interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Waypoint {
  id: number;
  x: number;
  y: number;
  radius: number;
  reached: boolean;
  color: string;
}

interface GoalZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GameCanvasProps {
  ball: Vec2;
  pushers: Pusher[];
  walls: Wall[];
  goalZone: GoalZone;
  waypoints: Waypoint[];
  myUserId: string;
  canvasWidth: number;
  canvasHeight: number;
}

// ─── Constants ───────────────────────────────────────────────────

const BALL_RADIUS = 12;
const PUSHER_RADIUS = 16;
const LERP_FACTOR = 0.2;

// ─── Lerp helper ─────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Component ───────────────────────────────────────────────────

export default function GameCanvas({
  ball,
  pushers,
  walls,
  goalZone,
  waypoints,
  myUserId,
  canvasWidth,
  canvasHeight,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Lerped positions for smooth rendering
  const lerpedBall = useRef<Vec2>({ ...ball });
  const lerpedPushers = useRef<Map<string, Vec2>>(new Map());

  // Keep target positions in sync with props
  const targetBall = useRef<Vec2>(ball);
  const targetPushers = useRef<Pusher[]>(pushers);

  useEffect(() => {
    targetBall.current = ball;
  }, [ball]);

  useEffect(() => {
    targetPushers.current = pushers;
  }, [pushers]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const draw = () => {
      // Lerp positions toward targets
      lerpedBall.current.x = lerp(lerpedBall.current.x, targetBall.current.x, LERP_FACTOR);
      lerpedBall.current.y = lerp(lerpedBall.current.y, targetBall.current.y, LERP_FACTOR);

      for (const p of targetPushers.current) {
        const prev = lerpedPushers.current.get(p.userId) ?? { x: p.x, y: p.y };
        prev.x = lerp(prev.x, p.x, LERP_FACTOR);
        prev.y = lerp(prev.y, p.y, LERP_FACTOR);
        lerpedPushers.current.set(p.userId, prev);
      }

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Walls
      ctx.fillStyle = '#4a4a5a';
      for (const w of walls) {
        ctx.fillRect(w.x, w.y, w.width, w.height);
      }

      // Goal zone
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
      ctx.lineWidth = 2;
      ctx.fillRect(goalZone.x, goalZone.y, goalZone.width, goalZone.height);
      ctx.strokeRect(goalZone.x, goalZone.y, goalZone.width, goalZone.height);

      // Waypoints
      for (const wp of waypoints) {
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, wp.radius, 0, Math.PI * 2);
        ctx.fillStyle = wp.reached ? 'rgba(100, 100, 100, 0.3)' : `${wp.color}33`;
        ctx.fill();
        ctx.strokeStyle = wp.reached ? '#666' : wp.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Waypoint number
        ctx.fillStyle = wp.reached ? '#666' : wp.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(wp.id), wp.x, wp.y);
      }

      // Ball
      const bx = lerpedBall.current.x;
      const by = lerpedBall.current.y;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#b0b0b0';
      ctx.fill();
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pushers
      for (const p of targetPushers.current) {
        const pos = lerpedPushers.current.get(p.userId) ?? { x: p.x, y: p.y };
        const isMe = p.userId === myUserId;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, PUSHER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Highlight ring for local player
        if (isMe) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Polarity flip indicator
        if (p.polarityFlipped) {
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, PUSHER_RADIUS + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Initials
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getInitials(p.userName), pos.x, pos.y);
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [canvasWidth, canvasHeight, walls, goalZone, waypoints, myUserId]);

  // Scale canvas for high-DPI displays
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth * dpr}
      height={canvasHeight * dpr}
      style={{
        width: Math.min(canvasWidth, 800),
        height: Math.min(canvasHeight, 600),
        borderRadius: 12,
        border: '1px solid var(--rmhbox-border)',
      }}
    />
  );
}
