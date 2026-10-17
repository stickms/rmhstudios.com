/**
 * The test and device-lab surface of the effect (spec §11.2, §11.3; T15).
 *
 * ## Why modules register themselves
 *
 * The e2e suites need to reach inside the page — pause the renderer at `e`,
 * paint the textures solid red and blue, read GL object counts, ask the
 * controller what state it is in. Each of those lives in a different module
 * written by a different task. A central file that knew about all of them would
 * be edited by every task; instead each module calls {@link registerDebug} for
 * its own slot and this file never changes when a slot is added (tasks §3:
 * "each module registers its own hook via `registerDebug()`").
 *
 * ## It costs nothing unless asked for
 *
 * {@link registerDebug} is a no-op unless `?eversion-debug=1` is in the URL
 * (`isEversionDebugEnabled`), and without the flag `window.__eversion` does not
 * exist. Nothing else in this file runs at import time.
 *
 * ## Two files, because the registry has to be importable statically
 *
 * The spec wants the debug surface out of every static closure (§11.3 gate 39).
 * But the registrants — capture, placeholder, the renderer, the host, the
 * controller — call `registerDebug` from their own module scope, so the
 * registry itself is a static import of theirs. So this file is only the
 * registry (a few hundred bytes, no DOM, nothing imported but flags and types),
 * and everything heavy — the stats overlay — lives in `debug-overlay.ts`, which
 * is reached ONLY through the dynamic `import()` in {@link mountDebugOverlay}.
 * `__tests__/debug-closure.test.ts` pins that split until T29's permanent bundle
 * assertion replaces it: nobody imports `debug-overlay` statically.
 *
 * ## The loader
 *
 * {@link maybeLoadEversionDebug} is the one call site the app needs. T31 (the
 * controller) and T29 (prefetch) call it once, early on the client; it does
 * nothing without the flag and otherwise mounts the overlay. It is idempotent.
 *
 * ## Slots
 *
 * The slot SHAPES below are the contract; each owning task fills its slot:
 * `capture` (T17), `placeholder` (T18), `renderer` (T24/T25), `host` (T25),
 * `controller` (T31).
 */

import { isEversionDebugEnabled } from './flags';
import type {
  CaptureOptions,
  CaptureResult,
  EversionOutcome,
  FrameStats,
  GlCounters,
  Rgba,
} from './types';

/** `window.__eversion.capture` (T17). */
export interface CaptureDebug {
  /** Capture the viewport now, exactly as the BEFORE capture would. */
  captureNow(options?: Partial<CaptureOptions>): Promise<CaptureResult>;
  /** The most recent capture's size and main-thread duration. */
  last(): { width: number; height: number; scale: number; durationMs: number } | null;
}

/** `window.__eversion.placeholder` (T18). */
export interface PlaceholderDebug {
  /** Build a placeholder for the current route's nav leaf and report what is in it. */
  build(): Promise<{
    width: number;
    height: number;
    /** Pixel at each corner, to compare with `--site-bg`. */
    corners: Rgba[];
    /** Whether the centre region differs from the background (icon/label drawn). */
    centreInked: boolean;
    buildMs: number;
  }>;
}

/** `window.__eversion.renderer` (T24/T25). */
export interface RendererDebug {
  /** Freeze the eversion progress at `e` (`null` resumes). */
  pauseAt(e: number | null): void;
  /** Fill `before` and `after` with solid colours (spec §11.2 test 28). */
  solidTextures(before: Rgba, after: Rgba): void;
  counters(): GlCounters;
  /** `F(p, e)` for the whole mesh at each `e`, via transform feedback (test 27). */
  evaluate(es: Float32Array): Promise<Float32Array>;
  /** Skip the next re-plan of a channel (T35's deliberately injected hard cut). */
  injectHardCut(channel: string | null): void;
}

/** `window.__eversion.host` (T25). */
export interface HostDebug {
  mode(): 'worker' | 'main';
  /** Force the in-thread renderer on the next run (spec §11.2 test 36). */
  forceMainThread(force: boolean): void;
  /** The `done` stats of the last run. */
  lastStats(): FrameStats | null;
  /** How many `requestAnimationFrame` callbacks are pending (idle-at-rest checks). */
  pendingFrames(): number;
}

/** `window.__eversion.controller` (T31). */
export interface ControllerDebug {
  state(): {
    phase: 'idle' | 'priming' | 'running' | 'revealing' | 'done';
    coverActive: boolean;
    beforeReady: boolean;
    afterReady: boolean;
  };
  /** Start a run toward `href` using the current hub pose (the e2e entry point). */
  startTo(href: string): Promise<EversionOutcome>;
}

/** Every slot, keyed by the name a module registers under. */
export interface DebugSlots {
  capture: CaptureDebug;
  placeholder: PlaceholderDebug;
  renderer: RendererDebug;
  host: HostDebug;
  controller: ControllerDebug;
}
export type DebugSlotName = keyof DebugSlots;

/** `window.__eversion`: the registered slots plus a list of their names. */
export type EversionDebugRegistry = Partial<DebugSlots> & { slots(): DebugSlotName[] };

declare global {
  interface Window {
    __eversion?: EversionDebugRegistry;
  }
}

const listeners = new Set<() => void>();

/**
 * Be told when a slot is registered or removed (the overlay re-lists its slots
 * on it, so it needs no timer). Returns the unsubscribe function.
 */
export function onDebugChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a broken overlay must not break the module that registered a slot */
    }
  }
}

/**
 * Expose `api` as `window.__eversion[name]`. Returns the function that removes
 * it (call it on dispose). A no-op returning a no-op unless the debug flag is on
 * and a `window` exists. Re-registering a name replaces the previous value.
 */
export function registerDebug<K extends DebugSlotName>(name: K, api: DebugSlots[K]): () => void {
  if (typeof window === 'undefined' || !isEversionDebugEnabled()) return () => {};
  const registry: EversionDebugRegistry = (window.__eversion ??= {
    slots() {
      return (Object.keys(registry) as (keyof EversionDebugRegistry)[]).filter(
        (k): k is DebugSlotName => k !== 'slots',
      );
    },
  });
  const slots: Partial<DebugSlots> = registry;
  slots[name] = api;
  notify();
  return () => {
    if (slots[name] === api) {
      delete slots[name];
      notify();
    }
  };
}

let mounted: Promise<() => void> | null = null;

/**
 * Mount the fixed, `aria-hidden`, token-coloured stats overlay that prints the
 * render side's `done` stats (spec §11.3). The overlay module is fetched with a
 * dynamic `import()` so it is in no static closure. Synchronous for the caller:
 * the returned function unmounts it whenever the import has finished. A no-op
 * (returning a no-op) without the debug flag or a `document`. Idempotent: a
 * second call shares the one overlay.
 */
export function mountDebugOverlay(): () => void {
  if (typeof document === 'undefined' || !isEversionDebugEnabled()) return () => {};
  mounted ??= import('./debug-overlay').then((m) => m.mountOverlay());
  const pending = mounted;
  return () => {
    if (mounted === pending) mounted = null;
    void pending.then((dispose) => dispose());
  };
}

/**
 * The call site the app uses (T31/T29): load the debug surface if, and only if,
 * `?eversion-debug=1` is in the URL. Safe to call on the server and on every
 * client entry — it returns immediately without the flag.
 */
export function maybeLoadEversionDebug(): () => void {
  if (typeof window === 'undefined' || !isEversionDebugEnabled()) return () => {};
  return mountDebugOverlay();
}
