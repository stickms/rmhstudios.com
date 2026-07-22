/**
 * The "is the GL liquid layer live" signal — a tiny standalone module so the
 * widely-imported `useLiquidBody` hook can read it WITHOUT statically importing
 * the orchestrator (index.ts) and its detect/scene/renderer graph. That keeps the
 * shader-grade layer a lazily-loaded chunk (Providers dynamic-imports index.ts;
 * the hook only touches this + the registry).
 */

const listeners = new Set<(active: boolean) => void>();
let active = false;

/** True while a GL tier is rendering. */
export function isLiquidActive(): boolean {
  return active;
}

/** Set by the orchestrator on boot success / teardown. */
export function setLiquidActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const fn of listeners) fn(next);
}

/** Subscribe to active/inactive transitions; fires the current value immediately. */
export function subscribeLiquidActive(cb: (active: boolean) => void): () => void {
  listeners.add(cb);
  cb(active);
  return () => {
    listeners.delete(cb);
  };
}
