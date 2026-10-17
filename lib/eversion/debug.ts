/**
 * The test and device-lab surface of the effect (spec §11.2, §11.3; T15 owns
 * this file and everything beyond the registry).
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
 * exist. The stats overlay and anything heavy belong in a separate module that
 * T15 loads with a dynamic `import()` only under the flag, so nothing here
 * lands in any static closure (spec §11.3 test 39 asserts it).
 *
 * ## What is implemented now and what is not
 *
 * T01 implements the registry itself — about ten lines — and nothing else,
 * because a `registerDebug` that threw would crash every task that wires its
 * slot before T15 merges, and the whole point of this file is that wiring is
 * independent. The slot SHAPES below are the contract; T15 adds the overlay
 * ({@link mountDebugOverlay}), and each owning task fills its slot.
 */

import { isEversionDebugEnabled } from './flags';
import { notImplemented } from './not-implemented';
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
  return () => {
    if (slots[name] === api) delete slots[name];
  };
}

/**
 * Mount the fixed, `aria-hidden`, token-coloured stats overlay that prints the
 * render side's `done` stats (spec §11.3). T15 implements it in a module loaded
 * only under the debug flag; this is the signature callers use.
 */
export function mountDebugOverlay(): () => void {
  return notImplemented('mountDebugOverlay', 'T15');
}
