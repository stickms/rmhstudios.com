/**
 * Font readiness for canvas text.
 *
 * Canvas text is measured with the fonts available at measure time; if Inter
 * loads after first draw, every measurement is stale. This module watches
 * `document.fonts` and re-marks all text measure nodes dirty (then re-runs
 * layout) whenever the font set changes.
 */

import type { LayoutHandle, LayoutScheduler } from "../runtime/layout/LayoutTree";

const measureHandles = new Set<LayoutHandle>();
const schedulers = new Set<LayoutScheduler>();
let watching = false;

export function registerMeasureHandle(handle: LayoutHandle): () => void {
  measureHandles.add(handle);
  return () => measureHandles.delete(handle);
}

function invalidateAll() {
  for (const handle of measureHandles) {
    try {
      handle.yoga.markDirty();
    } catch {
      // node may have been freed between frames — harmless
    }
  }
  for (const scheduler of schedulers) scheduler.request();
}

/** Called by StageHost — re-layouts text when web fonts finish loading. */
export function watchFonts(scheduler: LayoutScheduler): () => void {
  schedulers.add(scheduler);
  if (!watching && typeof document !== "undefined" && "fonts" in document) {
    watching = true;
    document.fonts.ready.then(invalidateAll).catch(() => {});
    document.fonts.addEventListener?.("loadingdone", invalidateAll);
  }
  return () => schedulers.delete(scheduler);
}
