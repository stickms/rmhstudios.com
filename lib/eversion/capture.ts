/**
 * DOM-to-image capture of the viewport (spec §6). OWNER: T17. Client-only.
 *
 * Wraps `modern-screenshot` (already a dependency — `lib/library/epub-raster.ts`),
 * **dynamically imported** so it is in no static closure (spec §8.1). One
 * context is created per navigation and reused for the BEFORE and AFTER
 * captures, because font embedding and resource fetching are the expensive part
 * and a reused context pays them once; its fetch workers are on.
 *
 * ## What a capture is
 *
 * Exactly `innerWidth × innerHeight` CSS px at the current scroll, with
 * fixed/sticky elements in their on-screen positions, at
 * `min(devicePixelRatio, scaleCap)` and no bigger than `CAPTURE_MAX_DIMENSION`
 * on either side. `CAPTURE_EXCLUDE_SELECTORS` are absent. The result is an
 * `ImageBitmap` whose ownership passes to the caller.
 *
 * ## Fidelity (spec §6.4) — the clone, not the page, is adjusted
 *
 * - `backdrop-filter` cannot be rasterised, so the clone root carries the
 *   opaque-glass tier class (`glass-opaque`, the one Glass clarity "Opaque"
 *   applies; T17 confirms and records it, spec §14 item 3) and surfaces render
 *   as their designed opaque fallback rather than as holes.
 * - The clone root is restored to `opacity: 1` even while the live page is
 *   hidden under `html.eversion-cover` (spec §6.6).
 * - For AFTER, `data-eversion-settle` is on `<html>` so entrance animations do
 *   not run.
 * - Same-origin and CORS images inline; non-CORS ones fill with `--site-surface`;
 *   videos show their poster; 2D canvases copy; WebGL canvases without
 *   `preserveDrawingBuffer` capture blank (accepted).
 *
 * Budget: p95 ≤ 120 ms main-thread on the desktop reference, hard timeout
 * `CAPTURE_TIMEOUT_MS`. A timeout rejects with a `CaptureError` within
 * `timeout + 20 ms` and leaks no context. Measured with
 * `EVERSION_MEASURES.captureBefore/After`.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T17 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { CaptureApi, CaptureOptions, CaptureResult } from './types';

/**
 * A capture API with no session yet. The controller makes one per navigation;
 * the hub's BEFORE scheduler (T30) shares it. Registers the `capture` debug slot.
 */
export function createCapture(): CaptureApi {
  return notImplemented('createCapture', 'T17');
}

/**
 * Convenience for callers that need one capture and no session management: opens
 * a session, captures, and disposes. Not for the controller's two-capture flow.
 */
export function captureOnce(options: CaptureOptions): Promise<CaptureResult> {
  return notImplemented('captureOnce', 'T17');
}
