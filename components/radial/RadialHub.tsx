'use client';

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { LogOut, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
import { isEversionEnabled } from '@/lib/eversion/flags';
import type { EntryPoint } from '@/lib/eversion/marks';
import type { EversionNode, GlobeStartState } from '@/lib/eversion/types';
import EversionOverlay from './eversion/EversionOverlay';
import {
  awaitController,
  eversionRoot,
  getController,
  hasNoEffect,
  registerHub,
  setHubOpen,
  shellMounted,
  wantBridge,
  type NavigationReplay,
} from './eversion/eversion-root';
import { inShell } from './eversion/eversion-nav';
import { createHandOff, type HandOffHow } from './hub-handoff';
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
 * The Globe Eversion lives at the root of the page (`eversion/EversionRoot.tsx`, amended 2026-10-21): the warm-up,
 * the lazy bridge and the controller are no longer the hub's, so the effect also runs for transitions that start
 * or end outside the shell. The hub reaches the controller through `eversion/eversion-root.ts` (a types-only leaf),
 * draws the run's layers in its own stacking context (`EversionOverlay`, under its globe) and registers itself so
 * a navigation asked for while it is open is handed to its globe.
 */

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
/** The eversion hand-off's geometry (set on `.radial-hub` at the commit, read by radial.css), cleared when it ends. */
const HANDOVER_PROPS = [
  '--eversion-swell',
  '--eversion-dx',
  '--eversion-dy',
  '--eversion-delay',
  '--eversion-wrap',
] as const;

/** The effect's sphere has started to move: the glass globe swells with it (radial.css, `data-eversion-swell`). */
function markSwelling(hub: HTMLElement | null): void {
  hub?.setAttribute('data-eversion-swell', '');
}

function clearHandover(hub: HTMLElement | null): void {
  if (!hub) return;
  for (const name of HANDOVER_PROPS) hub.style.removeProperty(name);
  hub.removeAttribute('data-eversion-swell');
}

export function RadialHub() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  // The site's own Reduce motion switch, never the OS query (amended 2026-10-21): the hub's motion is the globe's
  // hand-over too, and it plays by default.
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
  /** The hub's root: the eversion hand-off's geometry is set on it as custom properties (radial.css). */
  const hubRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Whether the close currently in flight was a DISMISSAL (Escape, the X, an
   * outside tap) rather than a navigation. Only a dismissal returns focus to the
   * orb — restoring it after a navigation would yank focus off the page the
   * visitor just landed on, half a second after it rendered.
   */
  const restoreFocus = useRef(false);
  /**
   * An eversion just handed the screen back. The globe held focus through the run
   * and unmounts with it, which drops focus to <body>: a keyboard user would start
   * the new page from the top of the document. Land it on the page's <main>, as the
   * skip link does (spec S#25).
   */
  const landFocus = useRef(false);
  // `everting` keeps the globe mounted: it is fading out OVER the effect's
  // canvas, and unmounting it would cut that fade to a pop.
  const menuVisible = phase === 'open' || phase === 'closing' || phase === 'everting';
  /**
   * Globe Eversion (flag-gated). `eversionOn` is resolved after mount because the flag reads `location`, which the
   * server render does not have - it is what decides whether LiquidGlobe is handed `onNavigate` at all, so with the
   * flag off the globe is wired exactly as before. The controller is the root's (`eversion-root.ts`).
   */
  const [eversionOn, setEversionOn] = useState(false);
  const { bridgeWanted } = useSyncExternalStore(
    eversionRoot.subscribe,
    eversionRoot.getSnapshot,
    eversionRoot.getServerSnapshot,
  );
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
  const live = useRef<{ today(node: NavLeaf, how?: HandOffHow): void; dismiss(): void }>({
    today: noop,
    dismiss: noop,
  });
  const handOffMachine = useMemo(
    () =>
      createHandOff<NavLeaf>({
        navigateToday: (node, how) => live.current.today(node, how),
        everting: (handover) => {
          // The hub stays exactly as it is (`open`) until the run reaches its point
          // of no return; from here the run owns the screen. The globe is handed
          // over by motion (radial.css, `everting`): these say how far it swells and
          // travels to land on the effect's sphere, and when.
          clearTimer();
          restoreFocus.current = false;
          const hub = hubRef.current;
          if (hub && handover) {
            hub.style.setProperty('--eversion-swell', String(handover.swell));
            hub.style.setProperty('--eversion-dx', `${handover.dx}px`);
            hub.style.setProperty('--eversion-dy', `${handover.dy}px`);
            hub.style.setProperty('--eversion-delay', `${handover.delayMs}ms`);
            hub.style.setProperty('--eversion-wrap', `${handover.wrapMs}ms`);
          }
          setPhase('everting');
        },
        // The effect's sphere moves from its first frame: the glass globe swells with it from now (radial.css).
        // Written on the element, not through state, so no render lands in the frame the motion starts.
        swelling: () => {
          markSwelling(hubRef.current);
        },
        closed: () => {
          clearTimer();
          landFocus.current = true;
          clearHandover(hubRef.current);
          setPhase('closed');
        },
        dismiss: () => {
          clearHandover(hubRef.current);
          live.current.dismiss();
        },
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
      // The globe eversion's warm-up is the root's now (`EversionRoot`).
      void preloadGlobe()?.then(() => {
        if (rehearsed || phaseRef.current !== 'closed') return;
        rehearsed = true;
        setRehearsing(true);
      });
    };
    const timer = setTimeout(warm, 800);
    const handle = w.requestIdleCallback?.(warm, { timeout: 800 });
    return () => {
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
      if (e.key !== 'Tab' || phaseRef.current !== 'open') return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const controls = Array.from(
        overlay.querySelectorAll<HTMLElement>('a[href], button, [tabindex]'),
      ).filter(
        (el) =>
          el.tabIndex >= 0 &&
          !el.matches(':disabled') &&
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== 'hidden',
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;
      if (!overlay.contains(active) || (e.shiftKey ? active === first : active === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus({ preventScroll: true });
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    const overlay = overlayRef.current;
    const background = Array.from(hubRef.current?.parentElement?.children ?? []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== hubRef.current && !el.inert,
    );
    for (const el of background) el.inert = true;
    window.addEventListener('keydown', onKey);
    overlay?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      for (const el of background) el.inert = false;
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

  useEffect(() => {
    if (phase !== 'closed' || !landFocus.current) return;
    landFocus.current = false;
    // Focus still on the overlay counts as stranded: a mouse press on it focuses the
    // catcher, which stays mounted but is hidden once closed, so focus falls to <body>
    // a frame later.
    const active = document.activeElement;
    if (active && active !== document.body && !overlayRef.current?.contains(active)) return;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => () => clearTimer(), []);

  // Globe Eversion wiring. With the flag off this effect does one cheap read and returns.
  useEffect(() => {
    if (!isEversionEnabled()) return;
    setEversionOn(true);
  }, []);

  // The shell is here (the BEFORE capture runs ahead only under one), and the bridge's capture cue: the hub is open.
  useEffect(() => shellMounted(), []);
  useEffect(() => {
    setHubOpen(phase === 'open' || phase === 'everting');
  }, [phase]);
  useEffect(() => () => setHubOpen(false), []);

  // The hub is open: the visitor is about to pick a destination, so the effect's
  // warm-up stops waiting for `load` and idle. Held back until the open morph is
  // over AND the visitor is not dragging the globe (`quiet.ts`), so its chunk
  // parsing never lands inside either motion. A confirm before then asks at once.
  useEffect(() => {
    if (phase !== 'open' || !eversionOn || getController() || hasNoEffect()) return;
    let cancelQuiet: (() => void) | null = null;
    const timer = setTimeout(() => {
      cancelQuiet = whenQuiet(() => void wantBridge(), { quietMs: 250, idleTimeoutMs: 1000 });
    }, MOTION_MS);
    return () => {
      clearTimeout(timer);
      cancelQuiet?.();
    };
  }, [phase, eversionOn]);

  /**
   * LiquidGlobe's confirm hand-off (hold-release, pin click, Enter). Ineligible -
   * reduced motion, no WebGL2 - is exactly today's path. A bridge that has not
   * loaded yet is waited for (bounded; see `CONTROLLER_WAIT_MS`), so the first
   * navigation of a page-load plays the effect too. Otherwise the controller navigates by itself, while the hub
   * is still open (it renders and captures the destination behind a frozen picture of this page, then lets the
   * hub go `everting` as the animation starts); the hub must NOT. All of the rules (one
   * hand-off at a time, who navigates on which outcome) live in `hub-handoff.ts`.
   * Focus is left to the router either way.
   */
  live.current = {
    today: (node, how) => {
      dismissForNavigation();
      // Past the site's navigation interceptor (`eversion-nav.ts`): this IS the fallback, it must not be held back
      // for the effect a second time.
      if (how?.navigate) how.navigate();
      else void navigate({ to: node.href, ignoreBlocker: true } as never);
    },
    dismiss,
  };
  const handOff = useCallback(
    (
      node: NavLeaf,
      state: GlobeStartState,
      entry: Exclude<EntryPoint, 'preview'>,
      live?: () => GlobeStartState,
      how?: HandOffHow,
    ) => {
      // A destination outside the shell unmounts the hub mid-run, and the layers inside it: those runs draw at
      // the top of <body> instead (the hub's globe then hands over beneath them, which the sphere still starts from).
      const layer =
        how?.layer ?? (inShell(router as never, node.href.split(/[?#]/)[0]!) ? 'shell' : 'body');
      const withLayer: HandOffHow = { ...how, layer };
      const controller = getController();
      if (controller || hasNoEffect()) {
        handOffMachine.confirm(controller, node, state, entry, live, withLayer);
        return;
      }
      handOffMachine.confirmWhenReady(awaitController(), node, state, entry, live, withLayer);
    },
    [handOffMachine, router],
  );

  // A navigation asked for while the hub is open (a foot-bar link, a key) is handed to its globe, from where the
  // globe is on screen, instead of a globe popping up beside it.
  useEffect(
    () =>
      registerHub({
        isOpen: () => phaseRef.current === 'open',
        busy: () => handOffMachine.busy(),
        navigate: (node: EversionNode, replay: NavigationReplay) => {
          const globe = globeRef.current?.getBoundingClientRect();
          const v = { w: window.innerWidth, h: window.innerHeight };
          const pose: GlobeStartState = {
            yaw: 0,
            pitch: 0,
            yawVel: 0,
            pitchVel: 0,
            centre: globe
              ? [globe.left + globe.width / 2, globe.top + globe.height / 2]
              : [v.w / 2, v.h / 2],
            radius: globe ? Math.min(globe.width, globe.height) / 2 : Math.min(v.w, v.h) * 0.3,
          };
          handOff(node as NavLeaf, pose, 'click', undefined, {
            navigate: replay.go,
            traverses: replay.traverses,
            layer: replay.layer,
          });
        },
      }),
    [handOffMachine, handOff],
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
    <div ref={hubRef} className="radial-hub" data-phase={phase}>
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
        aria-haspopup="dialog"
        aria-controls="site-globe-navigation"
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
        id="site-globe-navigation"
        ref={overlayRef}
        className="radial-hub__overlay"
        role="dialog"
        aria-modal={menuVisible || undefined}
        aria-label={t('globe-navigation-title', { defaultValue: 'Explore with the globe' })}
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

      {/* The run's layers, in the shell's stacking context and under the globe, which is handed over on top of
          them. The controller itself is the root's (`EversionRoot`). */}
      {bridgeWanted && <EversionOverlay />}

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
