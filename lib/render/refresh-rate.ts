/**
 * Display refresh-rate estimate, shared by every 3D surface on the page.
 *
 * The frametime governor (`./governor.ts`) used to aim at a fixed 50fps. That
 * is the right floor for a 60Hz panel and the wrong goal for anything faster:
 * on a 144Hz display a scene holding 55fps never misses a 50fps budget, so the
 * governor never steps in — and the player sees a game running at a third of
 * what their monitor shows, with the uneven pacing that implies. The target has
 * to know the display.
 *
 * There is no API for refresh rate, so it is measured: the median interval of
 * a short burst of `requestAnimationFrame` callbacks, snapped to the nearest
 * common panel rate. The burst starts the first time anything asks (typically
 * when a game route's renderer module loads, while the page is still a cheap
 * DOM menu), and the result is cached for the life of the document. A burst
 * taken while the page is ALREADY slow under-reads — which errs toward a
 * lower target and therefore toward doing less, never more.
 */

const SAMPLE_FRAMES = 40;
const COMMON_RATES = [30, 50, 60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 300, 360];
const FALLBACK_HZ = 60;

let estimate: number | null = null;
let sampling = false;

function snap(hz: number): number {
  let best = COMMON_RATES[0];
  for (const r of COMMON_RATES) if (Math.abs(r - hz) < Math.abs(best - hz)) best = r;
  // Only snap when close; an odd panel (e.g. 119.88Hz video modes) keeps its own value.
  return Math.abs(best - hz) / best < 0.06 ? best : Math.round(hz);
}

function startSampling(): void {
  if (sampling || typeof requestAnimationFrame === 'undefined') return;
  sampling = true;
  const deltas: number[] = [];
  let last = 0;
  const tick = (now: number) => {
    if (last) deltas.push(now - last);
    last = now;
    if (deltas.length < SAMPLE_FRAMES) {
      requestAnimationFrame(tick);
      return;
    }
    deltas.sort((a, b) => a - b);
    const median = deltas[deltas.length >> 1];
    if (median > 0) estimate = snap(1000 / median);
  };
  requestAnimationFrame(tick);
}

/**
 * Best current estimate of the display's refresh rate in Hz. Returns 60 until
 * the first measurement completes (well under a second at any real rate).
 */
export function displayRefreshHz(): number {
  if (estimate === null) startSampling();
  return estimate ?? FALLBACK_HZ;
}

/** Test seam. */
export function resetRefreshEstimate(value: number | null = null): void {
  estimate = value;
  sampling = value !== null;
}
