'use client';

/**
 * Every animation frame the Dunesday desktop schedules lives in this file —
 * on purpose, so the rAF allowlist (`lib/__tests__/raf-loop-allowlist.test.ts`)
 * names one place to audit.
 *
 * Two users:
 *
 * 1. `rafThrottle` — coalesces a burst of pointer events into one write per
 *    frame (wallpaper parallax). One-shot: it schedules a frame only when an
 *    event arrived, never from inside its own callback.
 *
 * 2. `BubbleWorld` — the soap bubbles on the desktop: they drift up, bump into
 *    each other, shy away from the cursor or finger, and can be grabbed,
 *    dragged and thrown. Bounded by MOUNT like a game's loop: it runs only
 *    while the desktop is on screen, pauses while the tab is hidden, never
 *    starts under reduced motion, and `stop()` cancels the frame on unmount.
 *    Each frame writes only `transform` on a dozen elements — compositor work,
 *    no layout, no custom properties on <html>.
 *
 * Pointer reactivity here is a deliberate, scoped exception to the site's
 * retired cursor-tracking effects (design-language.md §5.1.1), made at the
 * owner's request for this one full-screen app: it moves pre-composited
 * layers instead of repainting gradients, which was the cost that rule exists
 * to prevent.
 */

export function rafThrottle(fn: () => void): { schedule: () => void; cancel: () => void } {
  let handle = 0;
  return {
    schedule: () => {
      if (handle) return;
      handle = requestAnimationFrame(() => {
        handle = 0;
        fn();
      });
    },
    cancel: () => {
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
    },
  };
}

export interface Bubble {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  held: boolean;
  popped: number;
}

const BUOYANCY = -14; // px/s² — gentle rise
const DRAG = 0.6; // per second
const REPEL_RADIUS = 120;
const REPEL_FORCE = 2600;
const MAX_SPEED = 1400;

export class BubbleWorld {
  bubbles: Bubble[] = [];
  width = 0;
  height = 0;
  pointer: { x: number; y: number; active: boolean } = { x: -9999, y: -9999, active: false };
  private handle = 0;
  private last = 0;
  private running = false;

  constructor(private onPop?: (b: Bubble) => void) {}

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  add(el: HTMLElement, r: number) {
    const b: Bubble = {
      el,
      r,
      x: Math.random() * Math.max(1, this.width - 2 * r) + r,
      y: Math.random() * Math.max(1, this.height - 2 * r) + r,
      vx: (Math.random() - 0.5) * 30,
      vy: -10 - Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
      held: false,
      popped: 0,
    };
    this.bubbles.push(b);
    this.paint(b);
    return b;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.handle) cancelAnimationFrame(this.handle);
    this.handle = 0;
  }

  /** Pop a bubble: it vanishes, then floats back in from the bottom a little later. */
  pop(b: Bubble) {
    b.popped = performance.now();
    b.held = false;
    b.el.classList.add('ds-os-bubble--popped');
    this.onPop?.(b);
  }

  private respawn(b: Bubble) {
    b.popped = 0;
    b.x = Math.random() * Math.max(1, this.width - 2 * b.r) + b.r;
    b.y = this.height + b.r;
    b.vx = (Math.random() - 0.5) * 20;
    b.vy = -30;
    b.el.classList.remove('ds-os-bubble--popped');
  }

  private paint(b: Bubble) {
    const wobble = 1 + Math.sin(b.phase) * 0.03;
    b.el.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0) scale(${wobble.toFixed(3)}, ${(2 - wobble).toFixed(3)})`;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { bubbles, width: W, height: H, pointer } = this;

    for (const b of bubbles) {
      if (b.popped) {
        if (now - b.popped > 4000) this.respawn(b);
        continue;
      }
      b.phase += dt * (2 + 30 / b.r);
      if (b.held) continue;
      b.vy += BUOYANCY * dt;
      b.vx += Math.sin(b.phase * 0.5) * 6 * dt;
      if (pointer.active) {
        const dx = b.x - pointer.x;
        const dy = b.y - pointer.y;
        const d = Math.hypot(dx, dy);
        const reach = REPEL_RADIUS + b.r;
        if (d > 0.01 && d < reach) {
          const f = (REPEL_FORCE * (1 - d / reach)) / Math.max(12, b.r * 0.25);
          b.vx += (dx / d) * f * dt;
          b.vy += (dy / d) * f * dt;
        }
      }
      const k = Math.exp(-DRAG * dt);
      b.vx *= k;
      b.vy *= k;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx = (b.vx / sp) * MAX_SPEED;
        b.vy = (b.vy / sp) * MAX_SPEED;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Walls bounce softly; the top wraps back to the bottom like rising air.
      if (b.x < b.r) {
        b.x = b.r;
        b.vx = Math.abs(b.vx) * 0.7;
      } else if (b.x > W - b.r) {
        b.x = W - b.r;
        b.vx = -Math.abs(b.vx) * 0.7;
      }
      if (b.y > H - b.r) {
        b.y = H - b.r;
        b.vy = -Math.abs(b.vy) * 0.6;
      }
      if (b.y < -b.r * 2) {
        b.y = H + b.r;
        b.x = Math.random() * Math.max(1, W - 2 * b.r) + b.r;
      }
    }

    // Soft elastic collisions between live bubbles.
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      if (a.popped) continue;
      for (let j = i + 1; j < bubbles.length; j++) {
        const c = bubbles[j];
        if (c.popped) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const min = a.r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (min - d) / 2;
        const ma = a.held ? 0 : a.r * a.r;
        const mc = c.held ? 0 : c.r * c.r;
        const total = ma + mc || 1;
        if (!a.held) {
          a.x -= nx * overlap * (mc ? 2 * (mc / total) : 1);
          a.y -= ny * overlap * (mc ? 2 * (mc / total) : 1);
        }
        if (!c.held) {
          c.x += nx * overlap * (ma ? 2 * (ma / total) : 1);
          c.y += ny * overlap * (ma ? 2 * (ma / total) : 1);
        }
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = (-1.6 * rel) / (1 / (ma || 1e9) + 1 / (mc || 1e9));
          if (!a.held) {
            a.vx -= (imp / (ma || 1e9)) * nx;
            a.vy -= (imp / (ma || 1e9)) * ny;
          }
          if (!c.held) {
            c.vx += (imp / (mc || 1e9)) * nx;
            c.vy += (imp / (mc || 1e9)) * ny;
          }
        }
      }
    }

    for (const b of bubbles) if (!b.popped) this.paint(b);
  };
}
