/**
 * Liquid body registry (§16.1.3).
 *
 * A single, module-level pool of at most {@link BODY_CAP} bodies. Consumers
 * register a body (getting a {@link LiquidBodyHandle}) and push fresh geometry
 * each frame from their OWN motion-value samplers — the registry never reads
 * layout and the render loop never allocates:
 *
 *  - Bodies live in a preallocated array; live ones occupy `[0, count)`.
 *  - `register` reuses a pooled object (swap-in), `remove` swap-deletes.
 *  - `set` mutates the pooled object in place through the handle's stable ref.
 *
 * The registry is backend-agnostic; index.ts reads {@link liveBodies} +
 * {@link liveCount} in the frame loop and {@link anyActive} for idle damping.
 */

import type { LiquidBody, LiquidBodyHandle, LiquidBodyKind, LiquidBodyPatch } from './types';

/** Hard cap from §16.1.5 — more than any real page needs at once. */
export const BODY_CAP = 24;

let nextId = 1;

function makeBody(): LiquidBody {
  return {
    id: 0,
    kind: 'capsule',
    cx: 0,
    cy: 0,
    hw: 0,
    hh: 0,
    radius: 0,
    press: 0,
    group: 0,
    active: false,
  };
}

// Preallocated pool — never grows, never reallocates during the frame loop.
const pool: LiquidBody[] = Array.from({ length: BODY_CAP }, makeBody);
let count = 0;

// Listeners fire when the population changes (register/remove) so index.ts can
// wake the render loop out of idle. Body *field* mutations don't notify (they're
// read every active frame anyway).
const listeners = new Set<() => void>();
function notify(): void {
  for (const fn of listeners) fn();
}

export function onRegistryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The live bodies array (borrowed — read `[0, liveCount())`, never retain). */
export function liveBodies(): readonly LiquidBody[] {
  return pool;
}

export function liveCount(): number {
  return count;
}

/** True when any live body is animating — the idle-damping input. */
export function anyActive(): boolean {
  for (let i = 0; i < count; i++) if (pool[i].active) return true;
  return false;
}

/**
 * Register a body. Returns `null` when the pool is full (the 25th body is simply
 * dropped — the fallback goo still renders it in DOM). The handle mutates the
 * pooled object in place, so it survives the swap-compaction on other removals.
 */
export function registerBody(kind: LiquidBodyKind, group = 0): LiquidBodyHandle | null {
  if (count >= BODY_CAP) return null;
  const body = pool[count];
  count++;
  const id = nextId++;
  body.id = id;
  body.kind = kind;
  body.cx = 0;
  body.cy = 0;
  body.hw = 0;
  body.hh = 0;
  body.radius = 0;
  body.press = 0;
  body.group = group;
  body.active = false;
  notify();

  let removed = false;
  return {
    id,
    set(patch: LiquidBodyPatch) {
      if (removed) return;
      if (patch.cx !== undefined) body.cx = patch.cx;
      if (patch.cy !== undefined) body.cy = patch.cy;
      if (patch.hw !== undefined) body.hw = patch.hw;
      if (patch.hh !== undefined) body.hh = patch.hh;
      if (patch.radius !== undefined) body.radius = patch.radius;
      if (patch.press !== undefined) body.press = patch.press;
      if (patch.active !== undefined) body.active = patch.active;
      if (patch.kind !== undefined) body.kind = patch.kind;
    },
    remove() {
      if (removed) return;
      removed = true;
      // Find the object's current slot (≤24 scan) and swap-delete so live
      // bodies stay packed in [0, count) with no holes and no reallocation.
      const idx = pool.indexOf(body);
      if (idx >= 0 && idx < count) {
        const last = count - 1;
        if (idx !== last) {
          const tmp = pool[idx];
          pool[idx] = pool[last];
          pool[last] = tmp;
        }
        count--;
      }
      notify();
    },
  };
}

/** Test/HMR hook — clears the pool without reallocating. */
export function resetRegistry(): void {
  count = 0;
  nextId = 1;
  listeners.clear();
}
