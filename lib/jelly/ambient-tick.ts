/**
 * The ambient tick grid every ambient clock shares: the glass engine's haze (`lib/liquid/glass/engine.ts`), the
 * docked navigation globe (`components/radial/LiquidGlobe.tsx`, its idle drift and its coat's haze) and the globe
 * cursor (`components/globe-cursor/GlobeCursor.tsx`, its eversion while the pointer rests).
 *
 * Each runs its own loop, and each ticks at the jelly ambient rate (`lib/jelly/tiers.ts` — `clockHz` while someone is
 * there, `idleClockHz` after `IDLE_AFTER_MS`, 0 under `still` and the degraded tiers). Two free-running 12 Hz clocks
 * land on different vsyncs and cost the page 24 frames a second where the R7 budget allows 12 (+1). So neither keeps
 * its own phase: a tick is due on the first frame past a multiple of `1000 / hz` ms of `performance.now()`, and a
 * sleeping loop wakes for exactly that boundary. Clocks at the same rate then always draw in the same frame.
 *
 * Pure; no clock of its own.
 */

/** Is a tick at `hz` due at `now`, the previous one having run at `last` (0 = none yet)? */
export function ambientTickDue(now: number, last: number, hz: number): boolean {
  if (!(hz > 0)) return false;
  if (last <= 0) return true;
  const period = 1000 / hz;
  return Math.floor(now / period) > Math.floor(last / period);
}

/**
 * Milliseconds from `now` until just past the next grid boundary at `hz` — the delay for a timer that wakes a loop
 * for its next tick. `Infinity` when `hz` is 0 (no tick is coming).
 */
export function msToAmbientTick(now: number, hz: number): number {
  if (!(hz > 0)) return Infinity;
  const period = 1000 / hz;
  return (Math.floor(now / period) + 1) * period - now + 1;
}
