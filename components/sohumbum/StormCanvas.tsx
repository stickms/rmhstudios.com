'use client';

/**
 * The storm layer: a full-viewport canvas that draws a lightning bolt every few
 * seconds, over a flash overlay that fires with it.
 *
 * A bolt is built by recursive midpoint displacement — take the segment from
 * cloud to ground, push its midpoint sideways by a random amount, recurse on
 * both halves with half the displacement, and stop once the displacement is
 * under a pixel or two. Each node has a small chance of throwing a branch, which
 * recurses the same way. The path is stroked twice: a thin white core with a
 * tight cyan glow, then a wider translucent blue over it with a wide blue glow.
 *
 * Neither layer takes pointer events, so the page underneath stays clickable.
 */

import { useEffect, useRef } from 'react';
import { gameSurfaceDpr } from '@/lib/display-scale';

interface StormCanvasProps {
  /** Suppressed entirely when true — no bolts, no flash. */
  disabled?: boolean;
  /** Fired at the moment of each strike, for the thunder. */
  onStrike?: () => void;
}

/** Displacement below this stops the recursion and draws the segment. */
const MIN_DISPLACEMENT = 2.5;
/** Sideways spread of the first midpoint, in CSS pixels. */
const ROOT_DISPLACEMENT = 130;
/** Chance a node spawns a branch. Higher gets bushy and stops reading as one bolt. */
const BRANCH_CHANCE = 0.12;

const STRIKE_MIN_MS = 6000;
const STRIKE_JITTER_MS = 4000;
const FIRST_STRIKE_MS = 1800;

export function StormCanvas({ disabled = false, onStrike }: StormCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref so a changing callback identity never restarts the storm.
  const onStrikeRef = useRef(onStrike);
  onStrikeRef.current = onStrike;

  useEffect(() => {
    if (disabled) return;

    const canvas = canvasRef.current;
    const flash = flashRef.current;
    if (!canvas || !flash) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !ctx) return;
      // Clamped, and used for BOTH the buffer size and the transform — sizing
      // from one ratio and drawing at another scales the whole scene.
      const dpr = gameSurfaceDpr(window);
      width = document.documentElement.clientWidth;
      height = document.documentElement.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    /** Collect the bolt as a flat list of segments before stroking any of it. */
    function collect(
      out: number[][],
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      displacement: number,
    ) {
      if (displacement < MIN_DISPLACEMENT) {
        out.push([x1, y1, x2, y2]);
        return;
      }

      const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * displacement;
      const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * displacement;

      if (Math.random() < BRANCH_CHANCE) {
        collect(
          out,
          midX,
          midY,
          midX + (Math.random() - 0.5) * displacement * 2,
          midY + Math.random() * displacement,
          displacement / 2,
        );
      }

      collect(out, x1, y1, midX, midY, displacement / 2);
      collect(out, midX, midY, x2, y2, displacement / 2);
    }

    function stroke(segments: number[][]) {
      if (!ctx) return;
      const path = new Path2D();
      for (const [x1, y1, x2, y2] of segments) {
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
      }

      // Wide, soft, blue — the air around the channel.
      ctx.strokeStyle = 'rgba(0, 85, 255, 0.6)';
      ctx.lineWidth = 6;
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#0011ff';
      ctx.stroke(path);

      // The channel itself.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00d9ff';
      ctx.stroke(path);
    }

    // Every timeout is tracked so a route change can cancel the whole chain.
    // The reference implementation recurses through `setTimeout` forever, which
    // in a SPA keeps striking a canvas that has already unmounted.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number) {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    }

    function clear() {
      ctx?.clearRect(0, 0, width, height);
    }

    function setFlash(opacity: string, transition?: string) {
      if (!flash) return;
      if (transition) flash.style.transition = transition;
      flash.style.opacity = opacity;
    }

    function strike() {
      clear();

      const topX = Math.random() * width;
      const groundX = topX + (Math.random() - 0.5) * 200;
      const segments: number[][] = [];
      collect(segments, topX, 0, groundX, height, ROOT_DISPLACEMENT);

      stroke(segments);
      onStrikeRef.current?.();

      // The flicker: a strike is several return strokes down one channel, so the
      // bolt and the sky it lights both stutter before the roll fades out.
      setFlash('0.25', 'opacity 0.05s ease-out');
      later(() => setFlash('0.05'), 60);
      later(() => {
        setFlash('0.2');
        clear();
      }, 130);
      later(() => {
        stroke(segments);
        setFlash('0.3');
      }, 180);
      later(() => {
        clear();
        setFlash('0', 'opacity 4.5s ease-out');
      }, 450);

      later(strike, STRIKE_MIN_MS + Math.random() * STRIKE_JITTER_MS);
    }

    later(strike, FIRST_STRIKE_MS);

    return () => {
      window.removeEventListener('resize', resize);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      clear();
    };
  }, [disabled]);

  if (disabled) return null;

  return (
    <>
      <div ref={flashRef} className="sohumbum-flash" aria-hidden />
      <canvas ref={canvasRef} className="sohumbum-lightning" aria-hidden />
    </>
  );
}
