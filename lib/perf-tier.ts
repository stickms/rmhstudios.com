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

/**
 * The thresholds, named once so the function below and the pre-paint script at
 * the bottom of this file cannot drift apart.
 */
/** Under this many GB of RAM is the low tier. Chromium-only, spec-quantised. */
export const LOW_MEMORY_GB = 4;
/** This many logical cores or fewer is the low tier. */
export const LOW_CORE_COUNT = 2;
/** Connection types treated as an implicit Data Saver request. */
export const SLOW_EFFECTIVE_TYPES = ['2g', 'slow-2g'] as const;

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
  if (
    connection?.effectiveType != null &&
    (SLOW_EFFECTIVE_TYPES as readonly string[]).includes(connection.effectiveType)
  ) {
    return true;
  }

  const memory = nav.deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory < LOW_MEMORY_GB) return true;

  const cores = nav.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= LOW_CORE_COUNT) return true;

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
 *
 * This is now a **re-assertion**, not the primary stamp: {@link PERF_TIER_SCRIPT}
 * runs in `<head>` and has already applied the class before first paint. Kept
 * because it costs nothing (`toggle` with an unchanged value does not
 * invalidate style) and it is the recovery path if the inline script threw.
 */
export function applyPerfTier(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('perf-lite', isLowEndDevice());
}

/**
 * The pre-paint form of {@link isLowEndDevice}, as an inline `<head>` script.
 *
 * ## Why this has to run before paint
 *
 * `perf-lite` is what switches off the aurora drift, the radial blob field, the
 * pane blur and the pointer light. Applied from a mount effect — which is where
 * it lived — the class landed only after the entry bundle had downloaded,
 * parsed and hydrated. So the devices the tier exists to protect rendered the
 * FULL effect stack for the whole of the load, which is both the most expensive
 * moment and the one the tier was meant to make cheap. It also meant a visible
 * restyle mid-load: full glass, then flat.
 *
 * Stamping it in `<head>` costs four property reads and gets the right
 * stylesheet on the first frame. Same placement, and the same reasoning, as the
 * `ios-webkit` stamp it sits next to in `app/routes/__root.tsx`.
 *
 * ## Why it is a string in THIS file
 *
 * A second implementation of a heuristic is exactly the drift this repo's gates
 * exist to catch, so the two forms are adjacent and share
 * {@link LOW_MEMORY_GB} / {@link LOW_CORE_COUNT} / {@link SLOW_EFFECTIVE_TYPES}
 * by interpolation rather than by copy. `lib/__tests__/perf-tier-script.test.ts`
 * evaluates this string against the same navigator fixtures it runs
 * `isLowEndDevice()` on and fails when they disagree.
 */
export const PERF_TIER_SCRIPT = `(function(){try{var n=navigator,c=n.connection||{},m=n.deviceMemory,h=n.hardwareConcurrency,S=${JSON.stringify(SLOW_EFFECTIVE_TYPES)},l=false;if(c.saveData===true)l=true;else if(c.effectiveType!=null&&S.indexOf(c.effectiveType)>=0)l=true;else if(typeof m==="number"&&m>0&&m<${LOW_MEMORY_GB})l=true;else if(typeof h==="number"&&h>0&&h<=${LOW_CORE_COUNT})l=true;if(l)document.documentElement.classList.add("perf-lite")}catch(e){}})()`;
