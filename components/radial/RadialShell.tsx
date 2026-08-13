'use client';

import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Bell, MessageCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { BackToTop } from '@/components/ui/back-to-top';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { RadialHub } from './RadialHub';
import { RadialNavRail } from './RadialNavRail';
import { RadialLiveRail } from './RadialLiveRail';
import { RailSlotContext } from './rail-slot';

/**
 * The four quick panels, behind a lazy boundary — same treatment, and the same
 * reasoning, as the nav globe in `RadialHub`.
 *
 * `TopBarPanels` was statically imported here, so every `_site` page shipped
 * it: four panel bodies, `QuickPanel`'s anchoring/viewport-fit/focus machinery,
 * seven lucide icons and `authClient` (the panels sign you out). None of it is
 * reachable until someone opens a panel, and on a phone the whole top bar is a
 * glance-and-move-on surface — but the code was parsed and hydrated on every
 * load regardless. That parse is main-thread time, which is the axis a phone
 * pays 4–6× on.
 *
 * All four `lazy()` calls name the SAME module, so they resolve to one chunk
 * fetched once — not four.
 */
const SearchPanel = lazy(() => import('./TopBarPanels').then((m) => ({ default: m.SearchPanel })));
const NotificationsPanel = lazy(() =>
  import('./TopBarPanels').then((m) => ({ default: m.NotificationsPanel })),
);
const MessagesPanel = lazy(() =>
  import('./TopBarPanels').then((m) => ({ default: m.MessagesPanel })),
);
const ProfilePanel = lazy(() => import('./TopBarPanels').then((m) => ({ default: m.ProfilePanel })));

let panelsPreloaded = false;
/**
 * Warm the panel chunk on the first sign of intent.
 *
 * Without it the first open waits on a network round trip with a `null`
 * Suspense fallback where the panel should be — the chunk is only requested
 * once the click has already happened. Hover, focus and touch-down all reach
 * this well before the click does, and the idle backstop in `RadialTopBar`
 * covers a visitor who taps without hovering first.
 */
function preloadPanels() {
  if (panelsPreloaded) return;
  panelsPreloaded = true;
  void import('./TopBarPanels');
}

/**
 * Renders a lazy panel only once the top bar has been used at least once.
 *
 * `children` is built unconditionally by the caller, which is free — a JSX
 * element is a plain object, and a `lazy()` component's import fires when it is
 * RENDERED, not when its element is created. So returning `null` here really
 * does mean the chunk is never requested.
 */
function LazyPanel({ mounted, children }: { mounted: boolean; children: ReactNode }) {
  if (!mounted) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

/**
 * Intent hints for the panel chunk, spread onto each top-bar control. Pointer
 * enter and focus cover a deliberate reach; pointer DOWN is the one that
 * matters on touch, where there is no hover to precede the tap.
 */
const panelIntentProps = {
  onPointerEnter: preloadPanels,
  onPointerDown: preloadPanels,
  onFocus: preloadPanels,
} as const;

/**
 * Fixed monochrome backdrop: concentric hairline rings centred on the viewport.
 *
 * The rings used to drift a few pixels **against the pointer**, driven by a
 * `pointermove` listener and a rAF lerp mounted on every page in the site shell.
 * That is retired along with the rest of the site's cursor reactivity (see the
 * §5.1 note in `app/globals.css`). It was the cheapest of the pointer effects —
 * one transform on one composited layer — but it was also the most constant: the
 * listener was live on every route, and the lerp meant a pointer that crossed the
 * window kept scheduling frames for a third of a second after it stopped. Frames
 * spent on a backdrop are frames not spent on the thing the pointer is actually
 * heading for.
 *
 * What is left is static geometry plus the CSS blob field's own slow keyframes,
 * which run on the compositor and cost the main thread nothing.
 */
function RadialBackdrop() {
  return (
    <div className="radial-backdrop" aria-hidden>
      <div className="radial-backdrop__rings">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="radial-backdrop__ring" style={{ ['--i' as string]: i }} />
        ))}
      </div>
      {/* Blob field: a few slow-drifting blobs that swell together and pull
          apart like lava — the liquid substrate the glass surfaces float over.
          The fusing comes from the blobs' own soft-edged gradients, and always
          did: a viewport-sized SVG filter with animating children re-rasterises
          every frame and cost this page ~4x its frame time (see the cost note in
          radial.css above the field's media query). CSS still keeps the whole
          layer off phones / reduced-motion. */}
      <div className="radial-backdrop__field">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="radial-backdrop__blob" style={{ ['--i' as string]: i }} />
        ))}
      </div>
    </div>
  );
}

type QuickPanelId = 'search' | 'notifications' | 'messages' | 'profile';

/**
 * Slim, quiet utility bar. Identity + search + inbox; the radial hub owns nav.
 *
 * Every control here opens a **preview panel** before it opens a page: search
 * drops a live result list, the bell shows the latest notifications, the inbox
 * shows recent threads, the avatar opens a compact account menu. Each panel has
 * a footer link through to the full route, so nothing is hidden behind the
 * preview — it just saves a navigation for the common case.
 */
function RadialTopBar() {
  const { t } = useTranslation('feed');
  const { data: session, isPending: sessionUnknown } = useSession();
  const { resolved } = useResolvedUser();
  const { pathname } = useLocation();
  const signedIn = Boolean(session);

  const [panel, setPanel] = useState<QuickPanelId | null>(null);
  /**
   * Latch: has a panel ever been opened on this page?
   *
   * The panels have to be MOUNTED to close properly — `QuickPanel` runs an exit
   * animation through `usePopPresence`, so a panel that is unmounted the moment
   * `open` goes false vanishes instead of animating out. Rendering them only
   * while `panel === id` would do exactly that. The latch keeps the group
   * mounted from the first open onward, so every open and close after that
   * behaves precisely as it did when the import was static — the only thing
   * that changed is that a visitor who never touches the top bar never
   * downloads it.
   */
  const [panelsMounted, setPanelsMounted] = useState(false);
  const searchRef = useRef<HTMLButtonElement | null>(null);
  const messagesRef = useRef<HTMLButtonElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const avatarRef = useRef<HTMLButtonElement | null>(null);

  const unread = useUnreadCount(signedIn);
  const { count: notifications } = useNotificationCount(signedIn);

  // A panel is scoped to the page it was opened on; a client navigation (from
  // one of its own links, or the back button) always dismisses it.
  useEffect(() => setPanel(null), [pathname]);

  // Idle backstop for the panel chunk, mirroring `RadialHub`'s globe warm-up:
  // the hover/focus/touch-down hints below cover a deliberate reach for a
  // control, and this covers everyone else — late enough to stay behind the
  // page's own first paint, early enough to be resolved before a first tap.
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const timer = setTimeout(preloadPanels, 800);
    const handle = w.requestIdleCallback?.(preloadPanels, { timeout: 800 });
    return () => {
      clearTimeout(timer);
      if (handle !== undefined) w.cancelIdleCallback?.(handle);
    };
  }, []);

  const toggle = (id: QuickPanelId) => {
    setPanelsMounted(true);
    setPanel((p) => (p === id ? null : id));
  };
  const close = () => setPanel(null);

  return (
    <header className="radial-topbar">
      <Link
        to="/"
        className="radial-topbar__brand"
        aria-label={t('home-aria-label', { defaultValue: 'RMH Studios home' })}
      >
        <span className="radial-topbar__mark" aria-hidden>
          RMH
        </span>
        <small>{t('studio-wordmark', { defaultValue: 'Studios' })}</small>
      </Link>

      <div className="radial-topbar__actions">
        <button
          type="button"
          ref={searchRef}
          className="radial-topbar__btn"
          data-fluid-press=""
          onClick={() => toggle('search')}
          {...panelIntentProps}
          aria-haspopup="dialog"
          aria-expanded={panel === 'search'}
          aria-label={t('search', { defaultValue: 'Search' })}
        >
          <Search aria-hidden />
        </button>
        <LazyPanel mounted={panelsMounted}>
          <SearchPanel open={panel === 'search'} onClose={close} anchorRef={searchRef} />
        </LazyPanel>

        {session ? (
          <>
            <button
              type="button"
              ref={messagesRef}
              className="radial-topbar__btn max-sm:hidden"
              data-fluid-press=""
              onClick={() => toggle('messages')}
              {...panelIntentProps}
              aria-haspopup="dialog"
              aria-expanded={panel === 'messages'}
              aria-label={t('messages', { defaultValue: 'Messages' })}
            >
              <MessageCircle aria-hidden />
              {unread > 0 && <span className="radial-topbar__dot" aria-hidden />}
            </button>
            <LazyPanel mounted={panelsMounted}>
              <MessagesPanel open={panel === 'messages'} onClose={close} anchorRef={messagesRef} />
            </LazyPanel>

            <button
              type="button"
              ref={bellRef}
              className="radial-topbar__btn"
              data-fluid-press=""
              onClick={() => toggle('notifications')}
              {...panelIntentProps}
              aria-haspopup="dialog"
              aria-expanded={panel === 'notifications'}
              aria-label={t('notifications', { defaultValue: 'Notifications' })}
            >
              <Bell aria-hidden />
              {notifications > 0 && <span className="radial-topbar__dot" aria-hidden />}
            </button>
            <LazyPanel mounted={panelsMounted}>
              <NotificationsPanel
                open={panel === 'notifications'}
                onClose={close}
                anchorRef={bellRef}
              />
            </LazyPanel>

            <button
              type="button"
              ref={avatarRef}
              className="radial-topbar__avatar"
              data-fluid-press=""
              onClick={() => toggle('profile')}
              {...panelIntentProps}
              aria-haspopup="dialog"
              aria-expanded={panel === 'profile'}
              aria-label={t('profile', { defaultValue: 'Profile' })}
            >
              <UserAvatar
                src={resolved?.image || session.user.image}
                alt={resolved?.name || session.user.name || 'You'}
                size={32}
                fallbackName={resolved?.name || session.user.name}
              />
            </button>
            <LazyPanel mounted={panelsMounted}>
              <ProfilePanel open={panel === 'profile'} onClose={close} anchorRef={avatarRef} />
            </LazyPanel>
          </>
        ) : sessionUnknown ? (
          // The session is UNKNOWN, not absent — the server lookup failed or
          // timed out (see __root's getInitialUser / Providers). Showing "Sign
          // in" here told signed-in visitors they were logged out and invited a
          // duplicate login; a neutral placeholder waits for the client session
          // to settle, which it does a moment later.
          <span
            className="radial-topbar__avatar-placeholder"
            aria-label={t('loading', { defaultValue: 'Loading…' })}
            role="status"
          />
        ) : (
          <Link
            to="/login"
            search={{ callbackURL: undefined }}
            className="radial-topbar__signin"
            data-fluid-press=""
          >
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        )}
      </div>
    </header>
  );
}

interface RadialShellProps {
  children: ReactNode;
  overlays?: ReactNode;
}

/**
 * The radial application frame shared by every standard (`_site`) route.
 *
 * ## The frame
 *
 * Mobile is one column, exactly as before. Wide screens get a three-track CSS
 * **grid** — nav rail · content · live rail — sized in explicit tracks so the
 * flanks can never overlap the middle: a grid item is laid out inside its track
 * by construction, and each track is `minmax(0, …)` so overflowing content
 * shrinks its own column instead of pushing a neighbour. Rails appear only at
 * the width that actually affords them (`display: none` below it, which also
 * removes them from the grid, so the track count and the visible columns always
 * agree).
 *
 * The frame is capped (`--rad-frame-max`) rather than edge-to-edge: "use the
 * whole window" means filling it with *content*, not stretching one reading
 * column to 3000px.
 */
export function RadialShell({ children, overlays }: RadialShellProps) {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const [railSlot, setRailSlot] = useState<HTMLElement | null>(null);
  const railSlotRef = useRef<HTMLDivElement | null>(null);

  // Publish the rail's page slot once it exists, so `PageLayout` can portal a
  // route's `rightSidebar` into it (see components/radial/rail-slot.tsx).
  useEffect(() => setRailSlot(railSlotRef.current), []);

  return (
    <div className="vibe-app site-shell radial-shell" data-home={isHome || undefined}>
      <a href="#main-content" className="radial-skip">
        {t('skipToContent', { defaultValue: 'Skip to content' })}
      </a>

      <RadialBackdrop />
      <RadialTopBar />

      <RailSlotContext.Provider value={railSlot}>
        <div className="radial-frame">
          <RadialNavRail />

          <main id="main-content" tabIndex={-1} className="radial-shell__main page-root">
            {children}
          </main>

          <RadialLiveRail>
            <div ref={railSlotRef} className="rad-rail__page-slot" />
          </RadialLiveRail>
        </div>
      </RailSlotContext.Provider>

      <RadialHub />

      {overlays}
      <BackToTop />
    </div>
  );
}
