/**
 * Frame-rate-independent smoothing.
 *
 * A follow written as `pos.lerp(target, 0.12)` inside a frame callback is
 * tuned for one refresh rate without saying so: it closes 12% of the gap *per
 * frame*, so on a 144Hz panel it converges 2.4× faster than on the 60Hz one it
 * was tuned on, and on a 240Hz panel 4×. Cameras get stiffer, accelerations get
 * snappier, and a scene that felt right on the author's monitor feels different
 * on every other one.
 *
 * `frameAlpha(k, dt)` returns the factor that closes the same fraction of the
 * gap per unit TIME that `k` closed per 60Hz frame — `1 - (1 - k)^(dt·60)` —
 * so existing tuning carries over unchanged at 60Hz and holds at every other
 * rate. `dt` is clamped so a tab restore or a long GC pause snaps rather than
 * overshooting.
 */
const REFERENCE_HZ = 60;
const MAX_DT_SECONDS = 0.1;

export function frameAlpha(perFrameAt60Hz: number, dtSeconds: number): number {
  const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT_SECONDS);
  return 1 - Math.pow(1 - perFrameAt60Hz, dt * REFERENCE_HZ);
}
