'use client';

import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Home, Wand2, Compass, Inbox, User, PenSquare } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { ComposeModal } from './ComposeModal';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useTranslation } from "react-i18next";

export function MobileNav() {
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const unreadCount = useUnreadCount(!!session);
  const { count: notificationCount } = useNotificationCount(!!session);

  const profileHref = session?.user?.id
    ? `/u/${(session.user as any).handle || session.user.id}`
    : '/login';

  const isHome = pathname === '/';
  const isExplore = pathname?.startsWith('/search');
  const isStudio = pathname?.startsWith('/create') || pathname?.startsWith('/builds') || pathname?.startsWith('/user-builds') || pathname?.startsWith('/v') || pathname?.startsWith('/personas');
  const isInbox = pathname?.startsWith('/messages') || pathname?.startsWith('/notifications') || pathname?.startsWith('/groups');
  const isProfile = pathname?.startsWith('/profile') || pathname?.startsWith('/u/');
  const inboxCount = unreadCount + notificationCount;
  const { t } = useTranslation("feed");

  const tabClass = (active: boolean) =>
    `relative flex items-center justify-center rounded-site-sm p-3 transition-[color,transform] duration-150 active:scale-[0.97] ${
      active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text'
    }`;

  // A small accent bar above the active tab — a clearer "you are here" cue than
  // colour alone (and helps low-vision users).
  const activeBar = (active: boolean) =>
    active ? (
      <span aria-hidden="true" className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-site-accent" />
    ) : null;

  return (
    <>
      {/* Floating New Post button */}
      {session && isHome && (
        <button
          onClick={() => setComposeOpen(true)}
          className="md:hidden fixed right-4 z-50 w-14 h-14 rounded-full bg-site-accent hover:bg-site-accent-hover text-site-accent-fg shadow-site flex items-center justify-center transition-colors active:scale-95"
          // Sit above the bottom nav AND the home-indicator safe area, so the
          // FAB never collides with the bar or tucks under the indicator.
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
          aria-label={t("new-post", { defaultValue: "New post" })}
        >
          <PenSquare className="w-6 h-6" />
        </button>
      )}

      {/* Bottom navigation bar — pb-safe keeps the tab row clear of the iOS
          home-indicator (fixed elements don't inherit the body's safe-area pad). */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 vibe-glass vibe-mobile-nav border-t border-site-border pb-safe">
        <div className="flex items-center justify-around min-h-12">
          <Link to="/" className={tabClass(isHome)} aria-label={t("home", { defaultValue: "Home" })} aria-current={isHome ? 'page' : undefined}>
            {activeBar(isHome)}
            <Home className="w-6 h-6" />
          </Link>

          <Link to="/search" search={{ q: '', tab: 'top' }} className={tabClass(isExplore)} aria-label={t("explore", { defaultValue: "Explore" })} aria-current={isExplore ? 'page' : undefined}>
            {activeBar(isExplore)}
            <Compass className="w-6 h-6" />
          </Link>

          <Link to="/create" className={tabClass(isStudio)} aria-label={t("creator-studio", { defaultValue: "Creator Studio" })} aria-current={isStudio ? 'page' : undefined}>
            {activeBar(isStudio)}
            <Wand2 className="w-6 h-6" />
          </Link>

          <Link to="/messages" className={tabClass(isInbox)} aria-label={t("inbox", { defaultValue: "Inbox" })} aria-current={isInbox ? 'page' : undefined}>
            {activeBar(isInbox)}
            <div className="relative">
              <Inbox className="w-6 h-6" />
              <NotificationBadge count={inboxCount} className="absolute -top-1.5 -right-1.5" />
            </div>
          </Link>

          <Link to={profileHref} className={tabClass(isProfile)} aria-label={t("profile", { defaultValue: "Profile" })} aria-current={isProfile ? 'page' : undefined}>
            {activeBar(isProfile)}
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
