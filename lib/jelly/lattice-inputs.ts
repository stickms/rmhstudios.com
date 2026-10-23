/**
 * The hand-off between the physics service and the glass engine for Tier L (02 §1.3, D9).
 *
 * Physics decides WHAT drives a slab's perimeter lattice (hover pull, press dent, drag pseudo-force, a neighbour or
 * arc impulse); the engine owns the {@link Lattice} itself and steps it inside its own frame. Neither imports the
 * other: physics writes here, the engine reads here.
 *
 * - `setLatticeDrive` / `latticeDrive` — the current continuous input per host (`null` clears it).
 * - `latticeImpulse` / `drainLatticeImpulses` — one-shot kicks queued until the engine's next frame drains them.
 * - `onLatticeWake` — the engine subscribes so a sleeping frame loop restarts when a drive or impulse arrives.
 *
 * WeakMap-backed (a removed host is collected with its state) and pure: no DOM reads, no clock.
 */

import type { LatticeInput } from './lattice';

export type { LatticeInput } from './lattice';

export interface LatticeImpulse {
  dx: number;
  dy: number;
  peak: number;
}

/** Impulses queued per host between engine frames — older ones beyond this are dropped (a burst is one wobble). */
const MAX_QUEUED_IMPULSES = 4;

let drives = new WeakMap<Element, LatticeInput>();
let impulses = new WeakMap<Element, LatticeImpulse[]>();
const wakeListeners = new Set<(el: Element) => void>();

function wake(el: Element): void {
  for (const cb of [...wakeListeners]) {
    try {
      cb(el);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

function sameInput(a: LatticeInput | undefined, b: LatticeInput | null): boolean {
  if (!a || !b || a.kind !== b.kind) return !a && !b;
  if (a.kind === 'drag' && b.kind === 'drag') return a.ax === b.ax && a.ay === b.ay;
  if (a.kind !== 'drag' && b.kind !== 'drag') {
    return a.x === b.x && a.y === b.y && (a.strength ?? 1) === (b.strength ?? 1);
  }
  return false;
}

/** Set (or clear with `null`) the continuous input driving `el`'s lattice. Wakes the engine when it changes. */
export function setLatticeDrive(el: Element, input: LatticeInput | null): void {
  const prev = drives.get(el);
  if (sameInput(prev, input)) return;
  if (input) drives.set(el, input);
  else drives.delete(el);
  wake(el);
}

/** The current continuous input for `el`, or `null`. */
export function latticeDrive(el: Element): LatticeInput | null {
  return drives.get(el) ?? null;
}

/** Queue a one-shot impulse (push direction `(dx, dy)`, `peak` px) for `el`'s lattice and wake the engine. */
export function latticeImpulse(el: Element, dx: number, dy: number, peak: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(peak > 0)) return;
  if (dx === 0 && dy === 0) return;
  let queue = impulses.get(el);
  if (!queue) impulses.set(el, (queue = []));
  queue.push({ dx, dy, peak });
  if (queue.length > MAX_QUEUED_IMPULSES) queue.splice(0, queue.length - MAX_QUEUED_IMPULSES);
  wake(el);
}

/** Take (and clear) every impulse queued for `el` since the last drain. */
export function drainLatticeImpulses(el: Element): Array<{ dx: number; dy: number; peak: number }> {
  const queue = impulses.get(el);
  if (!queue || queue.length === 0) return [];
  impulses.delete(el);
  return queue;
}

/** Called whenever a drive changes or an impulse is queued. Returns the unsubscribe. */
export function onLatticeWake(cb: (el: Element) => void): () => void {
  wakeListeners.add(cb);
  return () => {
    wakeListeners.delete(cb);
  };
}

/** Test-only: forget every drive, impulse and listener. */
export function resetLatticeInputsForTests(): void {
  drives = new WeakMap();
  impulses = new WeakMap();
  wakeListeners.clear();
}

/**
 * The press dent (#989): a Gaussian bowl under the pointer, in the host's own CSS px. Physics writes it while a press
 * is down or easing back (the dent slides with a drag; `depth` eases to 0 on release); the engine reads it every frame
 * it draws the host — rim indent, rim glow and the specular light dot on the far slope — and the lens follows it.
 * `null` once the dent has fully eased out.
 */
export interface JellyDent {
  /** Centre, host-local CSS px. */
  x: number;
  y: number;
  /** Current depth, CSS px (0..DENT.depthPx). */
  depth: number;
  /** Gaussian σ, CSS px. */
  radius: number;
  /** Rubber-band stretch when dragged off the element: unit direction × amount px (0 when inside). */
  stretchX: number;
  stretchY: number;
}

const dents = new WeakMap<Element, JellyDent>();

export function setDent(el: Element, dent: JellyDent | null): void {
  if (dent) dents.set(el, dent);
  else dents.delete(el);
  wake(el);
}

export function dentOf(el: Element): JellyDent | null {
  return dents.get(el) ?? null;
}
