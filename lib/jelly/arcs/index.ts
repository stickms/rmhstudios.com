/**
 * Electric arcs — the public API (docs/plans/plasmatic-jelly/03-arcs.md §3, §6).
 *
 * - {@link installElectricArcs}`(document)` mounts the system and returns its teardown. The integration hook
 *   lazy-imports this module in the shared jelly idle callback.
 * - {@link dischargeAt}`(x, y)` behaves like a pointer press at a viewport point (a "send" success state, a
 *   celebration). {@link strike}`(a, b)` arcs between two specific elements.
 *
 * Both go through every policy gate (preference, tier, hub/eversion, opt-outs) and the site-wide flash ledger; neither
 * bypasses them, and both are no-ops (returning false) before install, during SSR, or while arcs are off.
 */

import type { DischargeOptions, StrikeOptions } from './clicks';
import { activeElectricArcs } from './runtime';

export { installElectricArcs, activeElectricArcs, arcFlashLedger } from './runtime';
export type { ElectricArcsOptions, ElectricArcsRuntime } from './runtime';
export type { DischargeOptions, StrikeOptions } from './clicks';

/** Discharge at a viewport point as if pressed there. True when anything flashed. */
export function dischargeAt(x: number, y: number, opts?: DischargeOptions): boolean {
  return activeElectricArcs()?.dischargeAt(x, y, opts) ?? false;
}

/** One arc between two elements (default kind `click`). True when the bolt was admitted. */
export function strike(a: Element, b: Element, opts?: StrikeOptions): boolean {
  return activeElectricArcs()?.strike(a, b, opts) ?? false;
}
