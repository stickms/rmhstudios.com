'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, Menu, Hammer, User, PenSquare, MessageCircle } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { ComposeModal } from './ComposeModal';
import { useUnreadCount } from '@/lib/useUnreadCount';

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const unreadCount = useUnreadCount(!!session);

  const profileHref = session?.user?.id
    ? `/profile/${session.user.id}`
    : '/login';

  const isHome = pathname === '/';
  const isBuilds = pathname?.startsWith('/builds');
  const isMessages = pathname?.startsWith('/messages');
  const isUserBuilds = pathname?.startsWith('/user-builds');
  const isProfile = pathname?.startsWith('/profile');

  const tabClass = (active: boolean) =>
    `flex items-center justify-center p-3 transition-colors ${
      active ? 'text-site-accent' : 'text-site-text-muted'
    }`;

  return (
    <>
      {/* Floating New Post button */}
      {session && (
        <button
          onClick={() => setComposeOpen(true)}
          className="md:hidden fixed right-4 bottom-18 z-50 w-14 h-14 rounded-full bg-site-accent hover:bg-site-accent-hover text-white shadow-lg flex items-center justify-center transition-colors active:scale-95"
          aria-label="New post"
        >
          <PenSquare className="w-6 h-6" />
        </button>
      )}

      {/* Bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-site-bg/95 backdrop-blur-md border-t border-site-border">
        <div className="flex items-center justify-around h-12">
          <Link href="/" className={tabClass(isHome)} aria-label="Home">
            <Home className="w-6 h-6" />
          </Link>

          <Link href="/builds" className={tabClass(isBuilds)} aria-label="Official Builds">
            <Package className="w-6 h-6" />
          </Link>

          <button
            onClick={() => setDrawerOpen(true)}
            className={tabClass(drawerOpen)}
            aria-label="Menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {session ? (
            <Link href="/messages" className={tabClass(isMessages)} aria-label="Messages">
              <div className="relative">
                <MessageCircle className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            </Link>
          ) : (
            <Link href="/user-builds" className={tabClass(isUserBuilds)} aria-label="User Builds">
              <Hammer className="w-6 h-6" />
            </Link>
          )}

          <Link href={profileHref} className={tabClass(isProfile)} aria-label="Profile">
            <User className="w-6 h-6" />
          </Link>
        </div>
      </nav>

      {/* Menu drawer */}
      <MobileSidebarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
      />
    </>
  );
}
