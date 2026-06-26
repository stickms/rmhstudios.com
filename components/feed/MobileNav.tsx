'use client';

import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Home, Wand2, Compass, Inbox, User, PenSquare } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { ComposeModal } from './ComposeModal';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
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
    `relative flex items-center justify-center p-3 transition-[color,transform] duration-150 active:scale-90 ${
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
          className="md:hidden fixed right-4 bottom-18 z-50 w-14 h-14 rounded-full bg-site-accent hover:bg-site-accent-hover text-site-bg shadow-lg flex items-center justify-center transition-colors active:scale-95"
          aria-label={t("new-post", { defaultValue: "New post" })}
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
          <Link to="/" className={tabClass(isHome)} aria-label={t("home", { defaultValue: "Home" })} aria-current={isHome ? 'page' : undefined}>
            {activeBar(isHome)}
            <Home className="w-6 h-6" />
          </Link>

          <Link to="/search" search={{ q: '' }} className={tabClass(isExplore)} aria-label={t("explore", { defaultValue: "Explore" })} aria-current={isExplore ? 'page' : undefined}>
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
              {inboxCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
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
