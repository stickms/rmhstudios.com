/**
 * The Globe Eversion's root-level state: one controller per page, owned above every layout (amended 2026-10-21).
 *
 * It used to be the hub's: `RadialHub` warmed the runtime, mounted the lazy `EversionBridge` and kept the controller
 * it handed up. That tied the effect to the `_site` shell, which only some routes wear. Every page transition now
 * runs the effect ("not a single page transition should be without eversion"), including the ones that leave the
 * shell (the feed to a full-screen game unmounts the hub, and the controller with it, in the middle of the run) and
 * the ones that start outside it. So the warm-up, the bridge and the controller live at the root (`EversionRoot`),
 * and the hub, the navigation interceptor (`eversion-nav.ts`) and the Settings preview all reach them here.
 *
 * Plain module, TYPES-only imports: it is in the root's static closure, so nothing of the runtime may hang off it
 * (`pnpm check:bundle-budget`, S#39). The runtime itself arrives through the dynamic imports below.
 */

import type { PrefetchResult } from '@/lib/eversion/prefetch';
import type { EversionControllerHandle } from './useEversionController';
import type { EversionNode } from '@/lib/eversion/types';

/* ── The warm-up (moved from RadialHub) ────────────────────────────────────── */

/**
 * Start the Globe Eversion's warm-up, once per page load, and NOT before the page has finished loading (spec §8.1 /
 * S#40; review R6 M1). The import() of the prefetch module is itself a network request for its own chunk, so it is
 * the import that waits for `window` `load` (then one more task, then an idle slot) - not just the work inside it.
 *
 * `urgent` is the visitor's own intent (a navigation was asked for, the hub is open): it skips the remaining wait,
 * since the effect is about to be needed and a page whose `load` is held up by one slow image would otherwise never
 * play it.
 */
const NO_PREFETCH: PrefetchResult = { webgl2: false, tier: 'low', host: 'main' };
let eversionStart: Promise<PrefetchResult> | null = null;
let hurryEversion: (() => void) | null = null;
export function startEversion(urgent = false): Promise<PrefetchResult> {
  eversionStart ??= new Promise<PrefetchResult>((resolve) => {
    let ran = false;
    let hurried = false;
    const go = () => {
      const idle = (window as typeof window & { requestIdleCallback?: typeof requestIdleCallback })
        .requestIdleCallback;
      // After the load event has finished dispatching, then when the browser is idle.
      setTimeout(() => (idle ? idle(run, { timeout: 2000 }) : setTimeout(run, 200)), 0);
    };
    const run = () => {
      if (ran) return;
      ran = true;
      hurryEversion = null;
      void import('@/lib/eversion/prefetch')
        .then((m) => m.prefetchEversion({ urgent: hurried }))
        .then(resolve, () => resolve(NO_PREFETCH));
    };
    hurryEversion = () => {
      hurried = true;
      run();
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  });
  if (urgent) hurryEversion?.();
  return eversionStart;
}

/* ── The root store (what `EversionRoot` renders from) ─────────────────────── */

export interface RootState {
  /** Mount the lazy bridge (the warm-up said this device can run the effect, or a navigation asked for it). */
  bridgeWanted: boolean;
  /** The hub is open (or handing its globe over): the BEFORE capture's cue. */
  hubOpen: boolean;
  /** Shells (`RadialShell`) on the page: the ahead-of-time BEFORE capture runs only under one. */
  shells: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let state: RootState = { bridgeWanted: false, hubOpen: false, shells: 0 };
const SERVER_STATE: RootState = { bridgeWanted: false, hubOpen: false, shells: 0 };

function set(patch: Partial<RootState>): void {
  const next = { ...state, ...patch };
  if (
    next.bridgeWanted === state.bridgeWanted &&
    next.hubOpen === state.hubOpen &&
    next.shells === state.shells
  ) {
    return;
  }
  state = next;
  for (const l of [...listeners]) l();
}

export const eversionRoot = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): RootState => state,
  getServerSnapshot: (): RootState => SERVER_STATE,
};

export function setHubOpen(open: boolean): void {
  set({ hubOpen: open });
}

/** A shell mounted; call the returned function when it unmounts. */
export function shellMounted(): () => void {
  set({ shells: state.shells + 1 });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    set({ shells: Math.max(0, state.shells - 1) });
  };
}

/* ── The controller ────────────────────────────────────────────────────────── */

let controller: EversionControllerHandle | null = null;
/** The warm-up said this device cannot run the effect: never wait for a bridge. */
let noEffect = false;
const waiters = new Set<(c: EversionControllerHandle | null) => void>();
const controllerListeners = new Set<(c: EversionControllerHandle | null) => void>();

/**
 * How long an action waits for the bridge to hand its controller up when the visitor got there first (the first
 * seconds of a page-load). It was 2.5 s, or 8 s with "Always evert globe"; every transition now plays the effect,
 * so every one takes the long wait.
 */
export const CONTROLLER_WAIT_MS = 8000;

export function getController(): EversionControllerHandle | null {
  return controller;
}

export function hasNoEffect(): boolean {
  return noEffect;
}

/** Called by the bridge with its controller, and with `null` when it unmounts. */
export function setController(next: EversionControllerHandle | null): void {
  controller = next;
  if (next) for (const waiter of [...waiters]) waiter(next);
  for (const l of [...controllerListeners]) l(next);
}

/** Run `fn` whenever the controller changes; returns the remover. */
export function onController(fn: (c: EversionControllerHandle | null) => void): () => void {
  controllerListeners.add(fn);
  return () => {
    controllerListeners.delete(fn);
  };
}

/** Warm up at idle (no intent yet): mounts the bridge once the device is known to run the effect. */
export function warmEversion(): Promise<boolean> {
  return startEversion().then((result) => {
    if (result.webgl2) set({ bridgeWanted: true });
    else noEffect = true;
    return result.webgl2;
  });
}

/**
 * Ask for the bridge now (the visitor's intent: skip the idle wait). A device the warm-up says cannot run the
 * effect releases every waiting action to the ordinary navigation.
 */
export function wantBridge(): Promise<boolean> {
  return startEversion(true).then((result) => {
    if (result.webgl2) {
      set({ bridgeWanted: true });
      return true;
    }
    noEffect = true;
    for (const waiter of [...waiters]) waiter(null);
    return false;
  });
}

/** The controller, as soon as the bridge hands it up; `null` after `ms` or on a no-effect device. */
export function awaitController(ms = CONTROLLER_WAIT_MS): Promise<EversionControllerHandle | null> {
  return new Promise((resolve) => {
    if (controller) return resolve(controller);
    if (noEffect) return resolve(null);
    const done = (c: EversionControllerHandle | null) => {
      clearTimeout(timer);
      waiters.delete(done);
      resolve(c);
    };
    const timer = setTimeout(() => done(null), ms);
    waiters.add(done);
    void wantBridge();
  });
}

/* ── The hub, as the navigation interceptor sees it ────────────────────────── */

/** How a navigation the interceptor held back is issued once the effect has it: replayed exactly as asked. */
export interface NavigationReplay {
  /** Issue it, past the interceptor. */
  go(): void;
  /** It is a back/forward traversal (its own `popstate` is not the visitor's). */
  traverses: boolean;
  /** The run's layers go at the top of <body> (the destination is outside the shell, which unmounts the hub). */
  layer: 'shell' | 'body';
}

export interface HubPort {
  /** The hub's menu is up (a navigation asked for now is handed to its globe, not a pop-up one). */
  isOpen(): boolean;
  /** A hand-off is in flight. */
  busy(): boolean;
  /** Run the effect to `node` from the open hub's globe, issuing the navigation through `replay`. */
  navigate(node: EversionNode, replay: NavigationReplay): void;
}

let hub: HubPort | null = null;

/** The hub registers itself while mounted; returns the remover. */
export function registerHub(port: HubPort): () => void {
  hub = port;
  return () => {
    if (hub === port) hub = null;
  };
}

export function getHub(): HubPort | null {
  return hub;
}
