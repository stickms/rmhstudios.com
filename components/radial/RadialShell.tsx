'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Bell, MessageCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { BackToTop } from '@/components/ui/back-to-top';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { RadialHub } from './RadialHub';
import { RadialNavRail } from './RadialNavRail';
import { RadialLiveRail } from './RadialLiveRail';
import { RailSlotContext } from './rail-slot';
import { MessagesPanel, NotificationsPanel, ProfilePanel, SearchPanel } from './TopBarPanels';

/**
 * Fixed monochrome backdrop: concentric hairline rings centred on the viewport
 * that drift a few pixels against the pointer for parallax depth. Pointer-driven
 * transforms are written on a single rAF tick and skipped entirely under
 * reduced-motion or on coarse (touch) pointers.
 */
function RadialBackdrop() {
  const reduced = useReducedMotion();
  const ringsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) return;
    const el = ringsRef.current;
    if (!el || !window.matchMedia?.('(pointer: fine)').matches) return;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      // Delta-time smoothing, so the parallax settles at the same rate on a
      // 60Hz and a 144Hz display instead of snapping on fast panels.
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const k = 1 - Math.exp(-5 * dt);
      curX += (targetX - curX) * k;
      curY += (targetY - curY) * k;
      el.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
      if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * -28;
      targetY = (e.clientY / window.innerHeight - 0.5) * -28;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className="radial-backdrop" aria-hidden>
      <div className="radial-backdrop__rings" ref={ringsRef}>
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
  const searchRef = useRef<HTMLButtonElement | null>(null);
  const messagesRef = useRef<HTMLButtonElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const avatarRef = useRef<HTMLButtonElement | null>(null);

  const unread = useUnreadCount(signedIn);
  const { count: notifications } = useNotificationCount(signedIn);

  // A panel is scoped to the page it was opened on; a client navigation (from
  // one of its own links, or the back button) always dismisses it.
  useEffect(() => setPanel(null), [pathname]);

  const toggle = (id: QuickPanelId) => setPanel((p) => (p === id ? null : id));
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
          aria-haspopup="dialog"
          aria-expanded={panel === 'search'}
          aria-label={t('search', { defaultValue: 'Search' })}
        >
          <Search aria-hidden />
        </button>
        <SearchPanel open={panel === 'search'} onClose={close} anchorRef={searchRef} />

        {session ? (
          <>
            <button
              type="button"
              ref={messagesRef}
              className="radial-topbar__btn max-sm:hidden"
              data-fluid-press=""
              onClick={() => toggle('messages')}
              aria-haspopup="dialog"
              aria-expanded={panel === 'messages'}
              aria-label={t('messages', { defaultValue: 'Messages' })}
            >
              <MessageCircle aria-hidden />
              {unread > 0 && <span className="radial-topbar__dot" aria-hidden />}
            </button>
            <MessagesPanel open={panel === 'messages'} onClose={close} anchorRef={messagesRef} />

            <button
              type="button"
              ref={bellRef}
              className="radial-topbar__btn"
              data-fluid-press=""
              onClick={() => toggle('notifications')}
              aria-haspopup="dialog"
              aria-expanded={panel === 'notifications'}
              aria-label={t('notifications', { defaultValue: 'Notifications' })}
            >
              <Bell aria-hidden />
              {notifications > 0 && <span className="radial-topbar__dot" aria-hidden />}
            </button>
            <NotificationsPanel
              open={panel === 'notifications'}
              onClose={close}
              anchorRef={bellRef}
            />

            <button
              type="button"
              ref={avatarRef}
              className="radial-topbar__avatar"
              data-fluid-press=""
              onClick={() => toggle('profile')}
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
            <ProfilePanel open={panel === 'profile'} onClose={close} anchorRef={avatarRef} />
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
