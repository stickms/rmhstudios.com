'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
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
const LiquidGlobe = lazy(() =>
  import('./LiquidGlobe').then((m) => ({ default: m.LiquidGlobe })),
);

let globePreloaded = false;
function preloadGlobe() {
  if (globePreloaded) return;
  globePreloaded = true;
  void import('./LiquidGlobe');
}

type HubUser = { id: string; handle?: string | null; isAdmin?: boolean };

/** closed → open (the orb expands INTO the globe) → closing → closed. */
type Phase = 'closed' | 'open' | 'closing';

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
  const menuVisible = phase === 'open' || phase === 'closing';

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

  const close = useCallback(
    (dismissed = false) => {
      clearTimer();
      restoreFocus.current = dismissed;
      setPhase((p) => (p === 'closed' ? p : 'closing'));
      // Keep the overlay mounted while every layer animates out, then hide it.
      timerRef.current = setTimeout(() => setPhase('closed'), reduced ? 0 : MOTION_MS);
    },
    [reduced],
  );

  /** Navigation-driven close: the destination page owns focus from here. */
  const dismissForNavigation = useCallback(() => close(false), [close]);
  const dismiss = useCallback(() => close(true), [close]);

  const toggle = useCallback(() => {
    clearTimer();
    setPhase((p) => {
      // Opening is a single synchronous transition — no pre-centring step.
      if (p === 'closed') return 'open';
      restoreFocus.current = true;
      timerRef.current = setTimeout(() => setPhase('closed'), reduced ? 0 : MOTION_MS);
      return 'closing';
    });
  }, [reduced]);

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
    const timer = setTimeout(preloadGlobe, 800);
    const handle = w.requestIdleCallback?.(preloadGlobe, { timeout: 800 });
    return () => {
      clearTimeout(timer);
      if (handle !== undefined) w.cancelIdleCallback?.(handle);
    };
  }, []);

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
      if (e.key === 'Escape') dismiss();
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
  }, [phase, dismiss]);

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

  const tab = menuVisible ? 0 : -1;

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
    </div>
  );
}
