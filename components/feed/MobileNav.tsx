'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Home, Wand2, Compass, Inbox, User, PenSquare } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { ComposeModal } from './ComposeModal';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useTranslation } from "react-i18next";

/**
 * Twitter-style auto-hide for the bottom bar: hide when the reader scrolls DOWN
 * (they want to read), reveal when they scroll UP, stop, reach the top, or on
 * first load. Drives off the document scroll (the page scrolls the window now).
 */
function useAutoHide(): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let idle: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      raf.current = 0;
      const y = Math.max(0, window.scrollY);
      const dy = y - lastY.current;
      lastY.current = y;
      // Near the top → always shown. Otherwise follow the scroll direction with
      // a small dead-zone so tiny jitters don't toggle it.
      if (y <= 12) setHidden(false);
      else if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
      // Reveal once scrolling stops (inactive).
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => setHidden(false), 1400);
    };

    const onScroll = () => {
      if (!raf.current) raf.current = requestAnimationFrame(evaluate);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (idle) clearTimeout(idle);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return hidden;
}

export function MobileNav() {
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const unreadCount = useUnreadCount(!!session);
  const hidden = useAutoHide();

  const profileHref = session?.user?.id
    ? `/u/${(session.user as any).handle || session.user.id}`
    : '/login';

  const isHome = pathname === '/';
  const isExplore = pathname?.startsWith('/search');
  const isStudio = pathname?.startsWith('/create') || pathname?.startsWith('/builds') || pathname?.startsWith('/user-builds') || pathname?.startsWith('/v') || pathname?.startsWith('/personas');
  const isInbox = pathname?.startsWith('/messages') || pathname?.startsWith('/notifications') || pathname?.startsWith('/groups');
  const isProfile = pathname?.startsWith('/profile') || pathname?.startsWith('/u/');
  // Messages-only badge (mirrors the desktop rail): opening a conversation
  // clears it. Notifications live on the Notifications tab inside the inbox.
  const inboxCount = unreadCount;
  const { t } = useTranslation("feed");

  // Active tab = an accent glass capsule behind the icon; idle tabs are muted.
  const tabClass = (active: boolean) =>
    `relative flex items-center justify-center rounded-full size-11 transition-[color,transform] duration-150 active:scale-[0.94] ${
      active
        ? 'text-site-accent bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]'
        : 'text-site-text-muted hover:text-site-text'
    }`;

  // Slide the bar (and FAB) off the bottom when hidden. `100%` clears the bar's
  // full height incl. its safe-area padding; the FAB gets a bit extra so its
  // shadow doesn't peek. Both share the same spring easing.
  const slide = 'transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

  return (
    <>
      {/* Floating New Post button — an accent glass disc above the bar. Rides the
          same hide/reveal as the bar so they move together. */}
      {session && isHome && (
        <button
          onClick={() => setComposeOpen(true)}
          className={`md:hidden fixed right-4 z-50 w-14 h-14 rounded-full bg-site-accent/90 hover:bg-site-accent-hover text-site-accent-fg shadow-site shadow-[inset_0_1px_0_var(--site-glass-rim-soft)] flex items-center justify-center ${slide}`}
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
            transform: hidden ? 'translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 72px))' : 'translateY(0)',
          }}
          aria-label={t("new-post", { defaultValue: "New post" })}
        >
          <PenSquare className="w-6 h-6" />
        </button>
      )}

      {/* Full-width bottom tab bar (covers the bottom edge instead of floating as
          a pill). Auto-hides on scroll-down, reveals on scroll-up / idle / top /
          load. Its bottom padding clears the home indicator; being at bottom:0 it
          sits right against Safari's bar, which minimizes on the same scroll. */}
      <nav
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 glass-chrome border-t border-site-border shadow-site ${slide}`}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: hidden ? 'translateY(100%)' : 'translateY(0)',
        }}
        aria-hidden={hidden}
      >
        <div className="flex items-center justify-around px-2 py-1.5">
          <Link to="/" className={tabClass(isHome)} aria-label={t("home", { defaultValue: "Home" })} aria-current={isHome ? 'page' : undefined} tabIndex={hidden ? -1 : undefined}>
            <Home className="w-6 h-6" />
          </Link>

          <Link to="/search" search={{ q: '', tab: 'top' }} className={tabClass(isExplore)} aria-label={t("explore", { defaultValue: "Explore" })} aria-current={isExplore ? 'page' : undefined} tabIndex={hidden ? -1 : undefined}>
            <Compass className="w-6 h-6" />
          </Link>

          <Link to="/create" className={tabClass(isStudio)} aria-label={t("creator-studio", { defaultValue: "Creator Studio" })} aria-current={isStudio ? 'page' : undefined} tabIndex={hidden ? -1 : undefined}>
            <Wand2 className="w-6 h-6" />
          </Link>

          <Link to="/messages" className={tabClass(isInbox)} aria-label={t("inbox", { defaultValue: "Inbox" })} aria-current={isInbox ? 'page' : undefined} tabIndex={hidden ? -1 : undefined}>
            <div className="relative">
              <Inbox className="w-6 h-6" />
              <NotificationBadge count={inboxCount} className="absolute -top-1.5 -right-1.5" />
            </div>
          </Link>

          <Link to={profileHref} className={tabClass(isProfile)} aria-label={t("profile", { defaultValue: "Profile" })} aria-current={isProfile ? 'page' : undefined} tabIndex={hidden ? -1 : undefined}>
            <User className="w-6 h-6" />
          </Link>
        </div>
      </nav>

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
      />
    </>
  );
}
