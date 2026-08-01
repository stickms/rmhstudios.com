/**
 * `html.perf-lite` — the low-end device tier.
 *
 * This class is the site's single escape hatch from continuous decorative GPU
 * work, and it is read in a lot of places already:
 *
 *   app/globals.css          both aurora layers stop drifting + stop following
 *                            the pointer; `.lg-goo` metaball underlays are
 *                            dropped; `.glass-liquid`/`.glass-pane` degrade
 *   components/radial/radial.css   the backdrop blob field stops drifting
 *   lib/render/canvas2d-fx.ts, hooks/useGlassLight.ts,
 *   hooks/useLiquidBackground.ts, components/ui/liquid-morph.tsx,
 *   components/ui/liquid-pop.tsx, components/game/GameCanvas.tsx
 *
 * …and until now **nothing ever added it**, so every one of those degradations
 * was dead code and the weakest laptop on the site rendered the full effect
 * stack. That is what this module fixes.
 *
 * ## Why capability reads and not a frame-rate probe
 *
 * A measured-fps heuristic sounds better and behaves worse: it has to sample
 * during page load (the least representative moment there is), and a tier that
 * can flip mid-session restyles the whole document under the user for reasons
 * they cannot see. These are stable facts about the machine, read once, so the
 * tier a visitor gets is the same on every page.
 *
 * The thresholds are deliberately conservative — this is meant to catch genuinely
 * weak hardware, not to pre-emptively strip effects from mid-range machines:
 *
 * - `deviceMemory < 4` — under 4GB of RAM. Chromium-only and quantised by the
 *   spec (0.25/0.5/1/2/4/8); absent means unknown, which is treated as capable.
 * - `hardwareConcurrency <= 2` — a dual-core (or single-core) CPU. Every
 *   compositor-thread animation on the site competes with the main thread there.
 *
 * Neither is spoof-proof or precise, and neither needs to be: being wrong costs
 * a visitor some ambient drift, not any content or function.
 */

/** True when this device should run the reduced-effect tier. */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };

  const memory = nav.deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory < 4) return true;

  const cores = nav.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 2) return true;

  return false;
}

/**
 * Stamp (or clear) `html.perf-lite`. Safe to call repeatedly; call it once on
 * mount — the signals it reads never change for the lifetime of the document.
 */
export function applyPerfTier(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('perf-lite', isLowEndDevice());
}
