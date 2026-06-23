'use client';

import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Home, Package, Compass, Inbox, User, PenSquare } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { ComposeModal } from './ComposeModal';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';

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
  const isBuilds = pathname?.startsWith('/builds') || pathname?.startsWith('/user-builds');
  const isInbox = pathname?.startsWith('/messages') || pathname?.startsWith('/notifications') || pathname?.startsWith('/groups');
  const isProfile = pathname?.startsWith('/profile') || pathname?.startsWith('/u/');
  const inboxCount = unreadCount + notificationCount;

  const tabClass = (active: boolean) =>
    `flex items-center justify-center p-3 transition-colors ${
      active ? 'text-site-accent' : 'text-site-text-muted'
    }`;

  return (
    <>
      {/* Floating New Post button */}
      {session && isHome && (
        <button
          onClick={() => setComposeOpen(true)}
          className="md:hidden fixed right-4 bottom-18 z-50 w-14 h-14 rounded-full bg-site-accent hover:bg-site-accent-hover text-site-bg shadow-lg flex items-center justify-center transition-colors active:scale-95"
          aria-label="New post"
        >
          <PenSquare className="w-6 h-6" />
        </button>
      )}

      {/* Bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 vibe-glass border-t border-site-border">
        <div className="flex items-center justify-end px-4 py-1 border-b border-site-border">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center justify-around h-12">
          <Link to="/" className={tabClass(isHome)} aria-label="Home">
            <Home className="w-6 h-6" />
          </Link>

          <Link to="/search" search={{ q: '' }} className={tabClass(isExplore)} aria-label="Explore">
            <Compass className="w-6 h-6" />
          </Link>

          <Link to="/builds" className={tabClass(isBuilds)} aria-label="Builds">
            <Package className="w-6 h-6" />
          </Link>

          <Link to="/messages" className={tabClass(isInbox)} aria-label="Inbox">
            <div className="relative">
              <Inbox className="w-6 h-6" />
              {inboxCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
            </div>
          </Link>

          <Link to={profileHref} className={tabClass(isProfile)} aria-label="Profile">
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
