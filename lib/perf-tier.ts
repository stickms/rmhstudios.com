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
 *   components/slice-it/GameCanvas.tsx
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
 * - `saveData` / `effectiveType: 2g` — an explicit Data Saver request, or a
 *   connection slow enough to stand in for one. Not a capability read at all:
 *   it is the visitor asking for less, which decorative GPU work is part of.
 * - `deviceMemory < 4` — under 4GB of RAM. Chromium-only and quantised by the
 *   spec (0.25/0.5/1/2/4/8); absent means unknown, which is treated as capable.
 * - `hardwareConcurrency <= 2` — a dual-core (or single-core) CPU. Every
 *   compositor-thread animation on the site competes with the main thread there.
 *
 * None is spoof-proof or precise, and none needs to be: being wrong costs a
 * visitor some ambient drift, not any content or function.
 *
 * ## What this tier is NOT, and why iPhones stay out of it
 *
 * Every signal above is Chromium-only except `hardwareConcurrency`, which an
 * iPhone reports as 4–6 — so in practice **no iPhone is ever `perf-lite`**, and
 * that is correct rather than a gap to be patched. A current iPhone is not a
 * weak device and should keep the full material; what it has is a *different
 * compositor*, which is a separate axis with its own signal ({@link isIosWebKit}).
 * Reaching for `perf-lite` to fix an iOS-specific rendering cost strips the
 * glass off the site's fastest phones and still leaves the actual cause running.
 *
 * (`lib/performance-tier.ts` is a second, orphaned copy of this decision —
 * tested, never imported, and disagreeing with this one about the thresholds. It
 * reaches the same conclusion about iOS by an explicit carve-out. Reconciling
 * the two is a product call about how many mid-range devices lose the glass, not
 * a perf fix, so it is deliberately left alone here.)
 */

/** The `navigator.connection` shape this module reads, none of it standard. */
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when this device should run the reduced-effect tier. */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: NetworkInformationLike;
  };

  // An explicit Data Saver request outranks every capability read: the visitor
  // asked for less, and continuous decorative GPU work is "less" whatever the
  // hardware can manage. Same for a connection this slow — a device on 2G is
  // usually a device with other things to worry about.
  const connection = nav.connection;
  if (connection?.saveData === true) return true;
  if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return true;

  const memory = nav.deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory < 4) return true;

  const cores = nav.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 2) return true;

  return false;
}

/**
 * Is this the low-end tier? Reads the class rather than re-deriving it, so a
 * caller can never disagree with what the stylesheet is doing.
 */
export function isPerfLite(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('perf-lite');
}

/**
 * Is this mobile Safari / any iOS browser (they are all WebKit)?
 *
 * **This is a different axis from {@link isPerfLite}, and conflating the two is
 * a mistake worth spelling out.** `perf-lite` means "this machine is weak".
 * `ios-webkit` means "this compositor behaves differently", and it says nothing
 * about how fast the device is — a current iPhone is one of the quickest things
 * that will ever load this site, and it must keep the full glass material. What
 * it does NOT keep is scroll-linked main-thread transform work, because iOS
 * scrolls on the compositor thread and hands JS the offset a frame late, so any
 * effect driven from a scroll event is structurally behind the content it is
 * decorating (`components/radial/RadialWheel.tsx` §the rake).
 *
 * The class is stamped pre-paint by `platformScript` in `app/routes/__root.tsx`.
 * Also read by `hooks/useLiquidBackground.ts` and the `html.ios-webkit` tier in
 * `app/globals.css` / `components/radial/radial.css`.
 */
export function isIosWebKit(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('ios-webkit');
}

/**
 * Can this browser run a scroll-driven CSS animation (`animation-timeline`)?
 *
 * Where it can, a scroll-linked decoration belongs in the stylesheet: it is
 * driven by the same thread that owns the scroll, so it cannot lag the content
 * the way a `scroll`-event + rAF pass does. Where it cannot, the effect has to
 * be either hand-driven or dropped — see `RadialWheel`, which chooses between
 * exactly those three outcomes.
 *
 * The matching stylesheet gate is `@supports (animation-timeline: view())`, and
 * the two must stay identical or both paths can run at once (or neither).
 */
export function supportsViewTimeline(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('animation-timeline', 'view()')
  );
}

/**
 * Stamp (or clear) `html.perf-lite`. Safe to call repeatedly; call it once on
 * mount — the signals it reads never change for the lifetime of the document.
 */
export function applyPerfTier(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('perf-lite', isLowEndDevice());
}
