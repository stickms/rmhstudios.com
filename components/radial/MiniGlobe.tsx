'use client';

import { useEffect, useRef } from 'react';
import { DoughBody, DOUGH_EXTENT } from '@/lib/dough';
import { drive } from '@/lib/jelly/frame';

/**
 * The docked orb: not a button with a picture on it, but a small globe — a lit sphere with a meridian and
 * parallel wireframe — that turns where you drag it and gives like dough where you press it, the same
 * body (`lib/dough.ts`) the full globe it swells into is made of.
 *
 * It listens on the button it sits in (`closest('button')`), so a tap still opens the navigator and a drag
 * only turns the globe (the click that ends a drag is swallowed). One canvas, drawn on the shared jelly frame
 * driver, and only while something moves: at rest it costs nothing. Colours are the theme's own tokens,
 * re-read when the interaction starts and when the root's class or style changes.
 */

/** Samples per ring. The canvas hangs out past the orb by `DOUGH_EXTENT` radii so a bulge has room. */
const RINGS = 64;
/** Radians turned per radius dragged, and the cap on tilt. */
const TURN = 1.6;
const PITCH_LIMIT = 1.2;
/** Drag past this many px and the click that follows is a drag's, not a tap. */
const TAP_SLOP = 8;
/** Inertia: yaw/pitch velocity decays by this factor per second. */
const SPIN_DECAY = 3.2;

interface Palette {
  accent: string;
  ink: string;
  ground: string;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--site-accent', '#0a84ff'),
    ink: v('--site-accent-fg', '#ffffff'),
    ground: v('--site-bg', '#000000'),
  };
}

export function MiniGlobe({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.closest('button');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;

    const dough = new DoughBody();
    const out = new Float64Array(2);
    let palette = readPalette();
    let size = 0; // css px
    let dpr = 1;
    let yaw = -0.5;
    let pitch = 0.32;
    let vyaw = 0;
    let vpitch = 0;
    let grabbed = false;
    let lastX = 0;
    let lastY = 0;
    let lastT = 0;
    let travelled = 0;
    let suppressClick = false;
    let box = { cx: 0, cy: 0, r: 1 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = rect.width;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      draw();
    };

    /** Rest position (unit sphere, rotated) → deformed canvas px. Depth is returned through `depth`. */
    let depth = 0;
    const place = (x: number, y: number, z: number): [number, number] => {
      const ca = Math.cos(yaw);
      const sa = Math.sin(yaw);
      const cb = Math.cos(pitch);
      const sb = Math.sin(pitch);
      const x1 = x * ca + z * sa;
      const z1 = -x * sa + z * ca;
      const y2 = y * cb - z1 * sb;
      depth = y * sb + z1 * cb;
      dough.deform(x1, y2, out, depth > 0 ? depth : 0);
      const half = size / 2;
      const r = half / DOUGH_EXTENT;
      return [half + out[0]! * r, half + out[1]! * r];
    };

    const draw = () => {
      if (size === 0) return;
      const half = size / 2;
      const r = half / DOUGH_EXTENT;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Body: the deformed silhouette.
      ctx.beginPath();
      for (let i = 0; i <= RINGS; i++) {
        const t = (i / RINGS) * Math.PI * 2;
        dough.deform(Math.cos(t), Math.sin(t), out);
        const px = half + out[0]! * r;
        const py = half + out[1]! * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = palette.accent;
      ctx.fill();
      ctx.clip();
      // Lit from the upper left, deepening toward the far limb: shading, not a gloss band.
      const lit = ctx.createRadialGradient(
        half - r * 0.38,
        half - r * 0.42,
        0,
        half - r * 0.38,
        half - r * 0.42,
        r * 1.25,
      );
      lit.addColorStop(0, palette.ink);
      lit.addColorStop(0.55, 'transparent');
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = lit;
      ctx.fillRect(0, 0, size, size);
      const deep = ctx.createRadialGradient(half, half, r * 0.55, half, half, r * 1.05);
      deep.addColorStop(0, 'transparent');
      deep.addColorStop(1, palette.ground);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = deep;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      // Wireframe: three meridians and three parallels, the back hemisphere faint.
      ctx.lineCap = 'round';
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = Math.max(1, size / 64);
      const line = (point: (t: number) => [number, number, number]) => {
        const front = new Path2D();
        const back = new Path2D();
        let prev: [number, number] | null = null;
        for (let i = 0; i <= RINGS; i++) {
          const [x, y, z] = point((i / RINGS) * Math.PI * 2);
          const p = place(x, y, z);
          if (prev) {
            const path = depth > 0 ? front : back;
            path.moveTo(prev[0], prev[1]);
            path.lineTo(p[0], p[1]);
          }
          prev = p;
        }
        ctx.globalAlpha = 0.14;
        ctx.stroke(back);
        ctx.globalAlpha = 0.6;
        ctx.stroke(front);
      };
      for (let k = 0; k < 3; k++) {
        const phi = (k * Math.PI) / 3;
        line((t) => [Math.cos(t) * Math.sin(phi), Math.sin(t), Math.cos(t) * Math.cos(phi)]);
      }
      for (const lat of [0, 0.7, -0.7]) {
        line((t) => [Math.cos(lat) * Math.cos(t), Math.sin(lat), Math.cos(lat) * Math.sin(t)]);
      }

      // The rim.
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, size / 56);
      ctx.beginPath();
      for (let i = 0; i <= RINGS; i++) {
        const t = (i / RINGS) * Math.PI * 2;
        dough.deform(Math.cos(t), Math.sin(t), out);
        const px = half + out[0]! * r;
        const py = half + out[1]! * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const driver = drive(
      (_now, dtMs) => {
        const dt = dtMs / 1000;
        if (!grabbed) {
          yaw += vyaw * dt;
          pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + vpitch * dt));
          const k = Math.exp(-SPIN_DECAY * dt);
          vyaw *= k;
          vpitch *= k;
          if (Math.abs(vyaw) < 0.01) vyaw = 0;
          if (Math.abs(vpitch) < 0.01) vpitch = 0;
        }
        const moving = dough.step(dt);
        draw();
        return grabbed || moving || vyaw !== 0 || vpitch !== 0;
      },
      { order: 10 },
    );

    const toDough = (e: PointerEvent) => ({
      x: (e.clientX - box.cx) / box.r,
      y: (e.clientY - box.cy) / box.r,
    });

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      box = {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        r: rect.width / 2 / DOUGH_EXTENT,
      };
      palette = readPalette();
      grabbed = true;
      travelled = 0;
      suppressClick = false;
      vyaw = vpitch = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = e.timeStamp;
      const p = toDough(e);
      dough.grab(p.x, p.y);
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer: the drag still works while it stays over the orb */
      }
      driver.wake();
    };

    const onMove = (e: PointerEvent) => {
      if (!grabbed) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dt = Math.max(1, e.timeStamp - lastT) / 1000;
      travelled += Math.hypot(dx, dy);
      if (travelled > TAP_SLOP) suppressClick = true;
      const dyaw = (dx / box.r) * TURN;
      const dpitch = (dy / box.r) * TURN;
      yaw += dyaw;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + dpitch));
      vyaw = dyaw / dt;
      vpitch = dpitch / dt;
      const p = toDough(e);
      dough.drag(p.x, p.y, dx / box.r / dt, dy / box.r / dt);
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = e.timeStamp;
      driver.wake();
    };

    const onUp = () => {
      if (!grabbed) return;
      grabbed = false;
      dough.release();
      // A flick keeps turning; a held-still release stays put.
      if (Math.hypot(vyaw, vpitch) < 0.6) vyaw = vpitch = 0;
      driver.wake();
    };

    const onClickCapture = (e: Event) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('click', onClickCapture, true);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    ro?.observe(canvas);
    // A theme or accent change repaints the resting globe in the new colours.
    const mo = new MutationObserver(() => {
      palette = readPalette();
      draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    resize();

    return () => {
      driver.stop();
      ro?.disconnect();
      mo.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
