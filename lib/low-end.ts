/**
 * The low-end CAPABILITY signal — "can this machine hold what a game or the globe's GL shader asks of it".
 *
 * This replaces the old low-end class on `<html>` (removed 2026-11-08, docs/superpowers/specs/2026-11-08-refractive-glass-design.md,
 * "Calls made" 1 and 2). It is deliberately NOT a material tier:
 *
 * - It is never stamped on `<html>`, never a CSS class, and the site's surfaces (flat under Steel) do not
 *   read it. Software-rendering browsers, Data Saver and low-memory devices get the same page.
 * - It is read by code that decides what ONE heavy feature does on a weak machine: the games' canvas glow and 3D tiers
 *   (`lib/game-capabilities.ts`, `lib/render/canvas2d-fx.ts`, slice-it, void-breaker, hearthworks model loading), the
 *   eversion effect's quality tier, and RUM (which reports the inputs). The liquid globe keeps one narrower read,
 *   {@link softRenderDetected}: a browser found to be rasterising in software keeps the CSS glass globe instead of a
 *   second GL context (the people with hardware acceleration off are who this effort started for).
 *
 * ## Why capability reads and not a frame-rate probe
 *
 * A measured-fps heuristic has to sample during page load (the least representative moment there is), and a signal that
 * can flip mid-session changes behaviour under the user for reasons they cannot see. These are stable facts about the
 * machine, read once, so a visitor gets the same answer on every page.
 *
 * The thresholds are deliberately conservative — this is meant to catch genuinely weak hardware:
 *
 * - `saveData` / `effectiveType: 2g` — an explicit Data Saver request, or a connection slow enough to stand in for one.
 * - `deviceMemory < 4` — under 4GB of RAM. Chromium-only and quantised by the spec; absent means unknown, which is
 *   treated as capable.
 * - `hardwareConcurrency <= 2` — a dual-core (or single-core) CPU.
 * - a software renderer, remembered in `localStorage` ({@link SOFT_RENDER_KEY}).
 *
 * No iPhone is ever low-end by these reads (every signal but `hardwareConcurrency` is Chromium-only, and an iPhone
 * reports 4–6 cores), which is correct: a current iPhone keeps everything.
 *
 * SSR-safe: nothing here touches `window`, `navigator` or `localStorage` at import.
 */

import { probeGpu } from '@/lib/render/probe';

/** The `navigator.connection` shape this module reads, none of it standard. */
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** Under this many GB of RAM is low-end. Chromium-only, spec-quantised. */
export const LOW_MEMORY_GB = 4;
/** This many logical cores or fewer is low-end. */
export const LOW_CORE_COUNT = 2;
/** Connection types treated as an implicit Data Saver request. */
export const SLOW_EFFECTIVE_TYPES = ['2g', 'slow-2g'] as const;
/**
 * `localStorage` key holding the time (ms since epoch) a software renderer was last found. A positive finding is trusted
 * for {@link SOFT_RENDER_TTL_MS}, so later page loads know about it before the globe chooses its backend.
 */
export const SOFT_RENDER_KEY = 'rmh-soft-render';
/** How long a software-renderer finding is trusted before the probe runs again (a user can turn acceleration back on). */
export const SOFT_RENDER_TTL_MS = 12 * 60 * 60 * 1000;

/** Epoch ms of the cached software-renderer finding, or 0 when absent, stale or unreadable. */
function softRenderStamp(): number {
  try {
    const at = Number(localStorage.getItem(SOFT_RENDER_KEY));
    return at > 0 && Date.now() - at < SOFT_RENDER_TTL_MS ? at : 0;
  } catch {
    return 0;
  }
}

let memo: boolean | null = null;

/** Forget the memoised answer. Tests, and {@link markSoftRender} (a new finding changes the answer). */
export function resetLowEndCapability(): void {
  memo = null;
}

/**
 * Has a software renderer been found on this browser (hardware acceleration off, a blocklisted driver, a VM)? Reads the
 * remembered finding only; it never probes. See {@link settleSoftRender}.
 */
export function softRenderDetected(): boolean {
  return softRenderStamp() > 0;
}

/** Remember that this browser rasterises in software (`false` forgets it, so turning acceleration back on takes effect). */
export function markSoftRender(soft = true): void {
  try {
    if (soft) localStorage.setItem(SOFT_RENDER_KEY, String(softRenderStamp() || Date.now()));
    else localStorage.removeItem(SOFT_RENDER_KEY);
  } catch {
    /* storage unavailable: the finding holds for this page only */
  }
  resetLowEndCapability();
}

/**
 * Is the browser rasterising in software? A software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render) or no WebGL at
 * all is the signature, read from a throwaway context (`lib/render/probe.ts`, the same probe the games use). Browsers
 * that mask the renderer string report a real one or none; neither is mistaken for software.
 */
export function detectSoftRender(): boolean {
  if (typeof document === 'undefined') return false;
  return probeGpu().gpuTier === 0;
}

/**
 * Settle whether this session draws in software and remember it. A fresh positive finding skips the probe (and the
 * context it creates); anything else probes once. Call once, at idle, after load. Returns the finding.
 */
export function settleSoftRender(): boolean {
  if (typeof document === 'undefined') return false;
  const soft = softRenderDetected() || detectSoftRender();
  markSoftRender(soft);
  return soft;
}

/** True when this device should keep the heavy optional work (game glow, 3D tiers, the eversion's mesh) small. */
export function isLowEndCapability(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (memo !== null) return memo;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: NetworkInformationLike;
  };

  // An explicit Data Saver request outranks every capability read: the visitor asked for less. Same for a connection
  // this slow — a device on 2G is usually a device with other things to worry about.
  const connection = nav.connection;
  if (connection?.saveData === true) return (memo = true);
  if (
    connection?.effectiveType != null &&
    (SLOW_EFFECTIVE_TYPES as readonly string[]).includes(connection.effectiveType)
  ) {
    return (memo = true);
  }

  if (softRenderStamp() > 0) return (memo = true);

  const memory = nav.deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory < LOW_MEMORY_GB) return (memo = true);

  const cores = nav.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= LOW_CORE_COUNT) return (memo = true);

  return (memo = false);
}
