'use client';

import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Home, Wand2, Compass, Inbox, User, PenSquare } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { ComposeModal } from './ComposeModal';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useTranslation } from "react-i18next";

export function MobileNav() {
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const unreadCount = useUnreadCount(!!session);

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

  return (
    <>
      {/* Floating New Post button — an accent glass disc that sits above the
          floating dock and clears the home-indicator safe area. */}
      {session && isHome && (
        <button
          onClick={() => setComposeOpen(true)}
          className="md:hidden fixed right-4 z-50 w-14 h-14 rounded-full bg-site-accent/90 hover:bg-site-accent-hover text-site-accent-fg shadow-site shadow-[inset_0_1px_0_var(--site-glass-rim-soft)] flex items-center justify-center transition-colors active:scale-95"
          style={{ bottom: 'calc(var(--safe-bottom) + 92px)' }}
          aria-label={t("new-post", { defaultValue: "New post" })}
        >
          <PenSquare className="w-6 h-6" />
        </button>
      )}

      {/* Floating glass dock (iOS-26 style): an inset capsule that hovers above
          the home-indicator — and above iOS Safari's floating tab bar, via
          --safe-bottom — instead of a full-bleed bottom bar. */}
      <nav
        className="md:hidden fixed inset-x-3 z-50 glass-chrome rounded-full border border-site-border shadow-site"
        style={{ bottom: 'calc(var(--safe-bottom) + 12px)' }}
      >
        <div className="flex items-center justify-around px-2 py-1.5">
          <Link to="/" className={tabClass(isHome)} aria-label={t("home", { defaultValue: "Home" })} aria-current={isHome ? 'page' : undefined}>
            <Home className="w-6 h-6" />
          </Link>

          <Link to="/search" search={{ q: '', tab: 'top' }} className={tabClass(isExplore)} aria-label={t("explore", { defaultValue: "Explore" })} aria-current={isExplore ? 'page' : undefined}>
            <Compass className="w-6 h-6" />
          </Link>

          <Link to="/create" className={tabClass(isStudio)} aria-label={t("creator-studio", { defaultValue: "Creator Studio" })} aria-current={isStudio ? 'page' : undefined}>
            <Wand2 className="w-6 h-6" />
          </Link>

          <Link to="/messages" className={tabClass(isInbox)} aria-label={t("inbox", { defaultValue: "Inbox" })} aria-current={isInbox ? 'page' : undefined}>
            <div className="relative">
              <Inbox className="w-6 h-6" />
              <NotificationBadge count={inboxCount} className="absolute -top-1.5 -right-1.5" />
            </div>
          </Link>

          <Link to={profileHref} className={tabClass(isProfile)} aria-label={t("profile", { defaultValue: "Profile" })} aria-current={isProfile ? 'page' : undefined}>
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
