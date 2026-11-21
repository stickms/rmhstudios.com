/**
 * Bundle entry for the generated head script (scripts/build-prepaint.ts).
 * Reads the `rmh-prepaint` JSON config block that precedes it, then runs the
 * steps. Everything here is guarded: a missing or corrupt config leaves `cfg`
 * empty and the steps that need it skip themselves.
 */
import { prepaint } from './index';
import type { PrepaintConfig } from './types';

(function () {
  let cfg: PrepaintConfig = {};
  try {
    const el = document.getElementById('rmh-prepaint');
    if (el && el.textContent) cfg = JSON.parse(el.textContent);
  } catch {
    /* no config: config-free steps still run */
  }
  let path = '';
  try {
    path = location.pathname;
  } catch {
    /* no location */
  }
  prepaint({
    doc: document,
    html: document.documentElement,
    win: typeof window === 'undefined' ? ({} as Window) : window,
    nav: typeof navigator === 'undefined' ? ({} as Navigator) : navigator,
    path,
    cfg,
  });
})();
