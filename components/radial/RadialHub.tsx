'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useThemeStore } from '@/stores/themeStore';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
import { isEversionEnabled } from '@/lib/eversion/flags';
import type { EntryPoint } from '@/lib/eversion/marks';
import type { PrefetchResult } from '@/lib/eversion/prefetch';
import type { GlobeStartState } from '@/lib/eversion/types';
import type { EversionControllerHandle } from './eversion/useEversionController';
import { createHandOff } from './hub-handoff';
import { whenQuiet } from './quiet';
import { RmhLogo } from './RmhLogo';

/**
 * The globe is the single biggest module in the `_site` shell's eager graph, and
 * it renders ONLY while the menu is open (`phase` starts `'closed'`, so it is
 * never in the server HTML and never on the hydration path). A static import
 * therefore put its whole cost — download, parse and compile — on every page that
 * wears the shell, for a component most page views never mount.
 *
 * It is behind a lazy boundary and a warm-up instead. `preloadGlobe` is the part
 * that makes this safe: opening is ONE synchronous 500 ms motion in which the orb
 * swells into the globe (see MOTION_MS), so a globe that arrives late would show
 * an empty overlay mid-morph. Warming the chunk on the first sign of intent —
 * hover, focus, touch-down, or just an idle moment after the shell mounts — means
 * the import is already resolved before the phase flips, and the Suspense
 * fallback is a frame nobody sees rather than a hole in the animation.
 */
const LiquidGlobe = lazy(() => import('./LiquidGlobe').then((m) => ({ default: m.LiquidGlobe })));

/**
 * The Globe Eversion's hub-side half (spec §9.2, tasks T32): the BEFORE capture
 * hook, the run controller and the overlay it draws into, all behind one lazy
 * boundary. Nothing about it may join this file's static imports — the capture
 * library, render host and renderer hang off it, and the shell's critical path
 * (`pnpm check:bundle-budget`, S#39) must not grow by any of them. The only
 * statics above are the flag and TYPES, which erase. It is rendered only once
 * the flag is on and the idle warm-up has run, so a visitor without the effect
 * never fetches it.
 */
const EversionBridge = lazy(() => import('./eversion/EversionBridge'));

/** The Settings "Preview" button's event (AppearancePanel.tsx; spec §9.3). */
const EVERSION_PREVIEW_EVENT = 'rmh:eversion-preview';

/**
 * Start the Globe Eversion's warm-up, once per page load, and NOT before the page
 * has finished loading (spec §8.1 / S#40; review R6 M1). The import() of the
 * prefetch module is itself a network request for its own chunk, so it is the
 * import that waits for `window` `load` (then one more task, then an idle slot) -
 * not just the work inside it. A page whose `load` is still pending because of a
 * slow subresource therefore requests nothing of the effect's. `prefetch.ts`
 * waits for `load` again itself as defence in depth.
 *
 * `urgent` is the visitor's own intent (the hub is open, or a destination was
 * picked): it skips the remaining wait, since the effect is about to be needed
 * and a page whose `load` is held up by one slow image would otherwise never
 * play it. Nothing ever passes it for a visitor who has not touched the hub, so
 * the "nothing before `load`" rule still holds for the page-load itself.
 */
const NO_PREFETCH: PrefetchResult = { webgl2: false, tier: 'low', host: 'main' };
let eversionStart: Promise<PrefetchResult> | null = null;
let hurryEversion: (() => void) | null = null;
function startEversion(urgent = false): Promise<PrefetchResult> {
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

/**
 * How long a confirm waits for the bridge to hand its controller up when the
 * visitor got there first (the first seconds of a page-load), before it navigates
 * the ordinary way. "Always evert globe" waits longer, like its other waits.
 */
const CONTROLLER_WAIT_MS = 2500;
const ALWAYS_CONTROLLER_WAIT_MS = 8000;

let globePreloaded = false;
let globeModule: Promise<unknown> | null = null;
function preloadGlobe() {
  if (globePreloaded) return globeModule;
  globePreloaded = true;
  globeModule = import('./LiquidGlobe');
  return globeModule;
}

/**
 * The rehearsal runs once per page load, whichever hub instance gets there.
 */
let rehearsed = false;
/** How long the invisible warm-up mount stays up: a few painted frames. */
const REHEARSAL_MS = 600;

type HubUser = { id: string; handle?: string | null; isAdmin?: boolean };

const noop = () => {};

/**
 * closed → open (the orb expands INTO the globe) → closing → closed, plus the
 * Globe Eversion's branch: open → everting → closed. `everting` is the hub having
 * let go of the screen: the veil, globe and foot fade out over the effect's
 * canvas (radial.css) and the orb stays hidden until the run is over.
 */
type Phase = 'closed' | 'open' | 'closing' | 'everting';

// One synchronous motion: the orb, the veil, the globe and the foot all animate
// together over this long. It also gates how long the overlay stays mounted while
// closing so the whole thing animates OUT before it hides.
const MOTION_MS = 500;

/**
 * The RMH navigator. Tapping the fixed RMH orb sends it to the middle of the
 * screen where it **swells into a liquid globe** — the site's destinations pinned
 * to a glass sphere you turn to explore. Drag it, bring a place into the reticle,
 * hold until the ring fills, and let go to land there. The geometry, the gesture
 * and the dwell logic all live in {@link LiquidGlobe}; this component owns the
 * phase state machine, the overlay, auth gating and the foot bar.
 *
 * The globe is mounted ONLY while the menu is up, which is what bounds its frame
 * loop — see the note on the loop in `LiquidGlobe.tsx`.
 */
export function RadialHub() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as HubUser | undefined;

  const [phase, setPhase] = useState<Phase>('closed');
  const globeRef = useRef<HTMLDivElement | null>(null);
  // Read by `attachGlobe`, which fires from a ref callback and so cannot close
  // over the render's `phase`.
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Whether the close currently in flight was a DISMISSAL (Escape, the X, an
   * outside tap) rather than a navigation. Only a dismissal returns focus to the
   * orb — restoring it after a navigation would yank focus off the page the
   * visitor just landed on, half a second after it rendered.
   */
  const restoreFocus = useRef(false);
  // `everting` keeps the globe mounted: it is fading out OVER the effect's
  // canvas, and unmounting it would cut that fade to a pop.
  const menuVisible = phase === 'open' || phase === 'closing' || phase === 'everting';
  /**
   * Globe Eversion (flag-gated; see `EversionBridge`). `eversionOn` is resolved
   * after mount because the flag reads `location`, which the server render does
   * not have — it is what decides whether LiquidGlobe is handed `onNavigate` at
   * all, so with the flag off the globe is wired exactly as before. `bridgeWanted`
   * mounts the lazy half, after the idle warm-up or on the first Settings preview.
   * `controllerRef` is what the bridge hands up; `null` until it has loaded, and
   * `null` means "ineligible" — today's navigation.
   */
  const [eversionOn, setEversionOn] = useState(false);
  const [bridgeWanted, setBridgeWanted] = useState(false);
  const controllerRef = useRef<EversionControllerHandle | null>(null);
  const pendingPreview = useRef(false);
  const pendingPreviewRun = useRef<((controller: EversionControllerHandle) => void) | null>(null);
  /** Confirms waiting for the bridge's controller (`awaitController`). */
  const controllerWaiters = useRef(new Set<(c: EversionControllerHandle | null) => void>());
  /** The warm-up said this device cannot run the effect: never wait for a bridge. */
  const noEffect = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;
  /**
   * The first-open rehearsal (2026-10-09).
   *
   * Preloading the chunk was not enough to make the FIRST open as smooth as the
   * second. Everything the open does for the first time still happened inside
   * the 500ms morph: the globe's code paths compiling on first call, its first
   * React mount, its canvas backing store being allocated and uploaded, its
   * layers rasterising for the first time, and the GPU setting up the programs
   * for the page blur and the veil's circular mask. Every later open reuses all
   * of that, which is why only the first one hitched.
   *
   * So the hub pays for it once, while the page is idle and before anyone
   * reaches for the orb: it mounts the globe for a few frames, invisibly —
   * fixed, 1% opacity, no pointer events, `inert`, haptics off — beside a tiny
   * element that uses the same blur and mask, then unmounts it.
   */
  const [rehearsing, setRehearsing] = useState(false);

  const leaves = useMemo<NavLeaf[]>(() => {
    const out: NavLeaf[] = [];
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) out.push(...item.children);
      else out.push(item);
    }
    return out.filter((leaf) => {
      if (leaf.requiresAuth && !session) return false;
      if (leaf.requiresAdmin && !user?.isAdmin) return false;
      return true;
    });
  }, [session, user?.isAdmin]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  /**
   * The hand-off state machine (`hub-handoff.ts`, unit tested). It reaches back
   * into the hub through `live`, which always holds this render's callbacks, so
   * the machine itself is built once.
   */
  const live = useRef<{ today(node: NavLeaf): void; dismiss(): void }>({
    today: noop,
    dismiss: noop,
  });
  const handOffMachine = useMemo(
    () =>
      createHandOff<NavLeaf>({
        navigateToday: (node) => live.current.today(node),
        everting: () => {
          // The hub stays exactly as it is (`open`) until the run reaches its point
          // of no return; from here the run owns the screen.
          clearTimer();
          restoreFocus.current = false;
          setPhase('everting');
        },
        closed: () => {
          clearTimer();
          setPhase('closed');
        },
        dismiss: () => live.current.dismiss(),
      }),
    [],
  );

  const close = useCallback(
    (dismissed = false) => {
      // A confirm is being handed to the effect: the hub is committed to leaving
      // by the effect's own route, and the pointer-up / click that ended the hold
      // lands on the (still open) scrim. Closing here would abort the run and
      // drop the BEFORE bitmap. The hand-off clears its flag before a fallback closes.
      if (handOffMachine.busy()) return;
      clearTimer();
      restoreFocus.current = dismissed;
      setPhase((p) => (p === 'closed' ? p : 'closing'));
      // Keep the overlay mounted while every layer animates out, then hide it.
      timerRef.current = setTimeout(() => setPhase('closed'), reduced ? 0 : MOTION_MS);
    },
    [reduced, handOffMachine],
  );

  /** Navigation-driven close: the destination page owns focus from here. */
  const dismissForNavigation = useCallback(() => close(false), [close]);
  const dismiss = useCallback(() => close(true), [close]);

  const toggle = useCallback(() => {
    if (handOffMachine.busy()) return;
    clearTimer();
    setPhase((p) => {
      // Opening is a single synchronous transition — no pre-centring step.
      if (p === 'closed') return 'open';
      restoreFocus.current = true;
      timerRef.current = setTimeout(() => setPhase('closed'), reduced ? 0 : MOTION_MS);
      return 'closing';
    });
  }, [reduced, handOffMachine]);

  // Backstop for the intent handlers: fetch the globe during the first idle
  // window after the shell settles. This is what keeps the lazy boundary honest
  // for someone who opens the menu as their very first action — the chunk is
  // already in the module cache by then, so the open is indistinguishable from
  // the old static import. Deliberately idle-scheduled so it never competes with
  // the page's own first paint, and a no-op where requestIdleCallback is absent
  // (Safari) beyond a short timer.
  // The two paths RACE; they are not an either/or, and that distinction is the
  // whole point of this effect.
  //
  // It used to be a branch: browsers WITH `requestIdleCallback` got idle with a
  // 3000ms timeout and no timer, everything else got a 1500ms timer. So on
  // Chrome and Android — the majority — the globe's chunk could still be
  // unresolved three seconds after the shell mounted, and idle is exactly what a
  // freshly-hydrated feed does not have. The orb is the site's primary
  // navigation control, so "tapped within the first few seconds" is the common
  // case, not the edge one: the phase flipped, `Suspense` rendered its `null`
  // fallback, and the veil and orb played the whole 500ms morph with a hole
  // where the globe should be. `onPointerDown={preloadGlobe}` does not save it —
  // that fires on the same event that opens the menu, so the import starts and
  // the animation starts together, and on touch there is no hover to warm it
  // earlier.
  //
  // Now: idle if it comes, a short timer regardless, whichever lands first.
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    // Well inside the window in which someone reaches for the orb, and late
    // enough to stay behind the page's own first paint.
    // Once the chunk is in, rehearse the open — see `rehearsing` below.
    const warm = () => {
      // Globe eversion: warm its runtime, behind a dynamic import so none of it
      // joins the shell's static closure (spec §8.1). The flag is a tiny leaf read
      // statically, so a visitor without the effect fetches nothing at all. This
      // timer can fire BEFORE `load` on a slow page, so nothing eversion-related is
      // requested from here until `startEversion` has seen `load` (R6 M1): not the
      // prefetch chunk, not the bridge. A device that reports no WebGL2 never
      // mounts the bridge at all (R6 m5).
      if (isEversionEnabled()) {
        void startEversion().then((result) => {
          if (unmounted) return;
          if (result.webgl2) setBridgeWanted(true);
          else noEffect.current = true;
        });
      }
      void preloadGlobe()?.then(() => {
        if (rehearsed || phaseRef.current !== 'closed') return;
        rehearsed = true;
        setRehearsing(true);
      });
    };
    let unmounted = false;
    const timer = setTimeout(warm, 800);
    const handle = w.requestIdleCallback?.(warm, { timeout: 800 });
    return () => {
      unmounted = true;
      clearTimeout(timer);
      if (handle !== undefined) w.cancelIdleCallback?.(handle);
    };
  }, []);

  // The rehearsal ends itself after a few frames, and is cut short by a real
  // open (the effect re-runs on `phase` and the real globe takes over).
  useEffect(() => {
    if (!rehearsing) return;
    if (phase !== 'closed') {
      setRehearsing(false);
      return;
    }
    const timer = setTimeout(() => setRehearsing(false), REHEARSAL_MS);
    return () => clearTimeout(timer);
  }, [rehearsing, phase]);

  // Block background scroll + wire Escape while the menu is active.
  //
  // Deliberately NOT a CSS scroll-lock on the document. Both `overflow: hidden`
  // and the position:fixed body technique clip the document to the visual
  // viewport, which on iOS clips away the content that normally scrolls under
  // Safari's floating bottom bar and leaves the bare page background showing
  // there as a stray coloured band. That was established on-device for the
  // mobile push-drawer this hub replaced, and is why that drawer blocked
  // background scroll from its scrim instead — the same approach used here.
  // Touch panning is blocked by `touch-action: none` on the overlay (radial.css);
  // wheel is blocked here, since touch-action doesn't cover pointer devices.
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      // While everting a key press is the effect's fast-forward (the controller
      // listens in the capture phase); it must not also dismiss the hub.
      if (e.key === 'Escape' && phaseRef.current !== 'everting' && !handOffMachine.busy())
        dismiss();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    const overlay = overlayRef.current;
    window.addEventListener('keydown', onKey);
    overlay?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('wheel', onWheel);
    };
  }, [phase, dismiss, handOffMachine]);

  // Focus lands on the GLOBE itself, not on its first pin: focusing a pin turns
  // the globe to face it, which would immediately discard the "you are here"
  // orientation the globe just opened with.
  //
  // This is a callback ref rather than an effect keyed on `phase`, because the
  // globe is lazy: an effect that ran on the phase flip would fire while the
  // chunk was still resolving, find `globeRef.current` null, and silently drop
  // focus — leaving a keyboard user stranded on an open menu. Driving it from the
  // ref means it fires exactly when the node actually exists, in both the warm
  // (already imported) and cold cases. `LiquidGlobe` takes `rootRef` as a plain
  // `Ref`, so a callback is a valid thing to hand it.
  const attachGlobe = useCallback((node: HTMLDivElement | null) => {
    globeRef.current = node;
    if (!node) return;
    requestAnimationFrame(() => {
      // Re-check: a fast open→close can retire the menu before this frame runs,
      // and focusing a globe that is on its way out would steal it back.
      if (phaseRef.current === 'open') node.focus();
    });
  }, []);

  // The orb leaves the tab order while the menu is up (it has become the globe),
  // so hand focus back to it when the menu is dismissed rather than navigated.
  useEffect(() => {
    if (phase !== 'closed' || !restoreFocus.current) return;
    restoreFocus.current = false;
    orbRef.current?.focus();
  }, [phase]);

  useEffect(() => () => clearTimer(), []);

  // Globe Eversion wiring. With the flag off this effect does one cheap read and
  // returns: no listener, no fetch, no state change.
  useEffect(() => {
    if (!isEversionEnabled()) return;
    setEversionOn(true);
    let alive = true;
    const unavailable = () =>
      toast.info(
        tRef.current('eversion-preview-unavailable', {
          defaultValue: 'This transition cannot play here, so pages change as usual.',
        }),
      );
    const preview = (controller: EversionControllerHandle) => {
      void controller.preview().then((outcome) => {
        // `busy` is a preview already running; `traversal` cannot happen here.
        if (alive && outcome.fallback && outcome.fallback !== 'busy') unavailable();
      });
    };
    const onPreview = () => {
      const controller = controllerRef.current;
      if (controller) {
        preview(controller);
        return;
      }
      // The bridge has not loaded yet: ask for it (after `load`, like everything
      // else) and run the preview the moment it hands the controller up. A device
      // that cannot run the effect says so instead of doing nothing.
      pendingPreview.current = true;
      void startEversion().then((result) => {
        if (!alive) return;
        if (result.webgl2) {
          setBridgeWanted(true);
        } else {
          pendingPreview.current = false;
          unavailable();
        }
      });
    };
    pendingPreviewRun.current = preview;
    window.addEventListener(EVERSION_PREVIEW_EVENT, onPreview);
    return () => {
      alive = false;
      window.removeEventListener(EVERSION_PREVIEW_EVENT, onPreview);
    };
  }, []);

  const onController = useCallback((controller: EversionControllerHandle | null) => {
    controllerRef.current = controller;
    if (controller && pendingPreview.current) {
      pendingPreview.current = false;
      pendingPreviewRun.current?.(controller);
    }
    if (controller) for (const waiter of [...controllerWaiters.current]) waiter(controller);
  }, []);

  /**
   * Ask for the bridge now (the visitor's intent: skip the idle wait). A device
   * the warm-up says cannot run the effect releases every waiting confirm to the
   * ordinary navigation.
   */
  const wantBridge = useCallback(() => {
    void startEversion(true).then((result) => {
      if (result.webgl2) {
        setBridgeWanted(true);
        return;
      }
      noEffect.current = true;
      for (const waiter of [...controllerWaiters.current]) waiter(null);
    });
  }, []);

  /** The controller, as soon as the bridge hands it up; `null` after `ms` or on a no-effect device. */
  const awaitController = useCallback(
    (ms: number) =>
      new Promise<EversionControllerHandle | null>((resolve) => {
        if (controllerRef.current) return resolve(controllerRef.current);
        if (noEffect.current) return resolve(null);
        const done = (controller: EversionControllerHandle | null) => {
          clearTimeout(timer);
          controllerWaiters.current.delete(done);
          resolve(controller);
        };
        const timer = setTimeout(() => done(null), ms);
        controllerWaiters.current.add(done);
        wantBridge();
      }),
    [wantBridge],
  );

  // The hub is open: the visitor is about to pick a destination, so the effect's
  // warm-up stops waiting for `load` and idle. Held back until the open morph is
  // over AND the visitor is not dragging the globe (`quiet.ts`), so its chunk
  // parsing never lands inside either motion. A confirm before then asks at once.
  useEffect(() => {
    if (phase !== 'open' || !eversionOn || controllerRef.current || noEffect.current) return;
    let cancelQuiet: (() => void) | null = null;
    const timer = setTimeout(() => {
      cancelQuiet = whenQuiet(wantBridge, { quietMs: 250, idleTimeoutMs: 1000 });
    }, MOTION_MS);
    return () => {
      clearTimeout(timer);
      cancelQuiet?.();
    };
  }, [phase, eversionOn, wantBridge]);

  /**
   * LiquidGlobe's confirm hand-off (hold-release, pin click, Enter). Ineligible -
   * reduced motion, no WebGL2 - is exactly today's path. A bridge that has not
   * loaded yet is waited for (bounded; see `CONTROLLER_WAIT_MS`), so the first
   * navigation of a page-load plays the effect too. Otherwise the hub lets go (`everting`) and the controller
   * navigates by itself at `start`; the hub must NOT. All of the rules (one
   * hand-off at a time, who navigates on which outcome) live in `hub-handoff.ts`.
   * Focus is left to the router either way.
   */
  live.current = {
    today: (node) => {
      dismissForNavigation();
      void navigate({ to: node.href } as never);
    },
    dismiss,
  };
  const handOff = useCallback(
    (node: NavLeaf, state: GlobeStartState, entry: Exclude<EntryPoint, 'preview'>) => {
      const controller = controllerRef.current;
      if (controller || noEffect.current) {
        handOffMachine.confirm(controller, node, state, entry);
        return;
      }
      const ms = useThemeStore.getState().alwaysEvertGlobe
        ? ALWAYS_CONTROLLER_WAIT_MS
        : CONTROLLER_WAIT_MS;
      handOffMachine.confirmWhenReady(awaitController(ms), node, state, entry);
    },
    [handOffMachine, awaitController],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          dismissForNavigation();
          navigate({ to: '/' });
          window.location.reload();
        },
      },
    });
  }, [navigate, dismissForNavigation]);

  // Nothing on the hub is operable while it fades over the effect.
  const tab = phase === 'open' || phase === 'closing' ? 0 : -1;

  return (
    <div className="radial-hub" data-phase={phase}>
      <button
        ref={orbRef}
        type="button"
        className="radial-hub__orb"
        // §5.5x A.1: bottom member of the mobile floating-bottom stack. Present on
        // every _site page, so globals.css lifts the cookie bar, mini-player and
        // back-to-top clear of it (and of the feed's compose FAB, which shares
        // this row but is shorter).
        data-floating="hub"
        data-fluid-press=""
        aria-haspopup="menu"
        aria-expanded={phase !== 'closed'}
        aria-label={t('open-menu', { defaultValue: 'Open navigation' })}
        // While the menu is up the orb has swelled into the globe and is an
        // invisible disc sitting on the reticle — it must leave the tab order
        // along with the pointer events radial.css takes off it.
        tabIndex={menuVisible ? -1 : 0}
        onClick={toggle}
        // Warm the globe chunk on intent so the open motion never waits on it.
        // `onPointerDown` is the one that matters on touch, where there is no
        // hover to precede the tap; it still buys the whole press-to-release
        // interval plus the 500 ms morph.
        onPointerEnter={preloadGlobe}
        onPointerDown={preloadGlobe}
        onFocus={preloadGlobe}
      >
        <RmhLogo className="radial-hub__logo" />
      </button>

      <div
        ref={overlayRef}
        className="radial-hub__overlay"
        role="presentation"
        aria-hidden={!menuVisible}
      >
        <button
          type="button"
          className="radial-hub__catcher"
          onClick={dismiss}
          aria-label={t('close', { defaultValue: 'Close' })}
          tabIndex={tab}
          // The one control on the overlay that is also a DRAG surface. It is a
          // button so an outside tap dismisses, but it is also every empty pixel
          // around the globe — the part of the screen a thumb can actually reach
          // — so the globe's gesture claims it (LiquidGlobe's surface listener
          // skips controls unless they carry this). A drag on it turns the globe
          // and its dismiss is swallowed; a tap still closes the menu.
          data-globe-surface=""
        />

        <div className="radial-hub__veil" aria-hidden />

        {/* Mounted only while the menu is up — that is what bounds the globe's
            frame loop, and it means a closed hub costs a page nothing. */}
        {menuVisible && (
          // `null` fallback: the orb, veil and foot are already animating, so on
          // the rare cold open the overlay simply completes its morph and the
          // globe lands into it. Anything else here would be a second visual
          // state competing with the one motion.
          <Suspense fallback={null}>
            <LiquidGlobe
              rootRef={attachGlobe}
              items={leaves}
              pathname={pathname}
              onDismiss={dismissForNavigation}
              onNavigate={eversionOn ? handOff : undefined}
              tabIndex={tab}
              // The globe's gesture is not confined to the sphere: the whole
              // overlay turns it, except where a real control lives.
              surfaceRef={overlayRef}
            />
          </Suspense>
        )}

        <div className="radial-hub__foot">
          {session && user ? (
            <>
              <Link
                to={`/u/${user.handle || user.id}` as string}
                className="radial-hub__identity"
                data-fluid-press="firm"
                onClick={dismissForNavigation}
                tabIndex={tab}
              >
                <UserAvatar
                  src={resolved?.image || session.user.image}
                  alt={resolved?.name || session.user.name || 'You'}
                  size={30}
                  fallbackName={resolved?.name || session.user.name}
                />
                <span>{resolved?.name || session.user.name}</span>
              </Link>
              <Link
                to="/settings"
                className="radial-hub__foot-btn"
                data-fluid-press=""
                onClick={dismissForNavigation}
                tabIndex={tab}
                aria-label={t('settings', { defaultValue: 'Settings' })}
              >
                <Settings aria-hidden />
              </Link>
              <button
                type="button"
                className="radial-hub__foot-btn"
                data-fluid-press=""
                onClick={signOut}
                tabIndex={tab}
                aria-label={t('sign-out', { defaultValue: 'Sign out' })}
              >
                <LogOut aria-hidden />
              </button>
            </>
          ) : (
            <Link
              to="/login"
              search={{ callbackURL: undefined }}
              className="radial-hub__signin"
              onClick={dismissForNavigation}
              tabIndex={tab}
            >
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          )}
          <button
            type="button"
            className="radial-hub__foot-btn radial-hub__close"
            data-fluid-press=""
            onClick={dismiss}
            tabIndex={tab}
            aria-label={t('close', { defaultValue: 'Close' })}
          >
            <X aria-hidden />
          </button>
        </div>
      </div>

      {bridgeWanted && (
        <Suspense fallback={null}>
          <EversionBridge
            open={phase === 'open' || phase === 'everting'}
            motionMs={MOTION_MS}
            onController={onController}
          />
        </Suspense>
      )}

      {/* Outside the overlay on purpose: the overlay is `visibility: hidden`
          while the hub is closed, and a rehearsal that never paints warms
          nothing. */}
      {rehearsing && phase === 'closed' && (
        <div className="radial-hub__rehearsal" aria-hidden inert>
          <Suspense fallback={null}>
            <LiquidGlobe
              items={leaves}
              pathname={pathname}
              onDismiss={noop}
              tabIndex={-1}
              rehearsal
            />
          </Suspense>
          <span className="radial-hub__rehearsal-fx" />
        </div>
      )}
    </div>
  );
}
