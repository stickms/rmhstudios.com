'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useMatch } from '@tanstack/react-router';
import { Menu, MessageSquare, Plus, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';

/**
 * The whole page frame for the games library, drawn as Steam's is: the dark top bar
 * with the logo and the STORE / LIBRARY / COMMUNITY row, the page, and the bottom bar.
 * The logo is the RMH Studios mark and goes home. Not pinned to either edge: the
 * page scrolls as a document, which is also what lets mobile Safari collapse its bars.
 */
export function SteamShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="steam">
      <SteamTopBar />
      <div className="stm-body">{children}</div>
      <SteamBottomBar />
    </div>
  );
}

/** Which top-level tab a pathname belongs to. */
export function steamTabFor(pathname: string): 'store' | 'library' | 'community' | 'arcade' | null {
  if (pathname.startsWith('/store') || pathname.startsWith('/games/store')) return 'store';
  if (pathname === '/arcade' || pathname.startsWith('/arcade/')) return 'arcade';
  if (
    pathname.startsWith('/games/community') ||
    pathname.startsWith('/games/profile') ||
    pathname.startsWith('/games/groups') ||
    pathname.startsWith('/games/inventory') ||
    pathname.startsWith('/games/market') ||
    pathname.startsWith('/games/trades') ||
    pathname.startsWith('/games/hub')
  ) {
    return 'community';
  }
  if (pathname === '/games' || pathname.startsWith('/games/')) return 'library';
  return null;
}

type SteamNavItem = { to: '/games/store' | '/games' | '/games/community' | '/arcade'; id: ReturnType<typeof steamTabFor>; label: string };

function SteamTopBar() {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
  const { data: session } = useSession();
  const tab = steamTabFor(pathname);
  // Offers waiting for the viewer, from the /games route loader (absent on error pages).
  const pending =
    useMatch({ from: '/games', shouldThrow: false })?.loaderData?.pendingTrades ?? 0;
  const user = session?.user as
    | { id: string; name?: string | null; image?: string | null; handle?: string | null }
    | undefined;
  const name = user?.name ?? user?.handle ?? '';
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  const items: SteamNavItem[] = [
    { to: '/games/store', id: 'store', label: t('steam-nav-store', { defaultValue: 'Store' }) },
    { to: '/games', id: 'library', label: t('steam-nav-library', { defaultValue: 'Library' }) },
    { to: '/games/community', id: 'community', label: t('steam-nav-community', { defaultValue: 'Community' }) },
    { to: '/arcade', id: 'arcade', label: t('steam-nav-arcade', { defaultValue: 'Arcade' }) },
  ];

  // Navigating closes the drawer; Escape closes it too and hands focus back to its button.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      root.style.overflow = prev;
    };
  }, [open]);

  const avatar = user ? (
    user.image ? (
      <img className="stm-avatar" src={user.image} alt="" width={32} height={32} />
    ) : (
      <span className="stm-avatar stm-avatar-fallback" aria-hidden>
        {name.charAt(0).toUpperCase()}
      </span>
    )
  ) : null;

  return (
    <header className="stm-topbar">
      <button
        type="button"
        ref={menuButton}
        className="stm-burger"
        aria-expanded={open}
        aria-controls="stm-drawer"
        aria-label={t('steam-menu', { defaultValue: 'Menu' })}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu aria-hidden />
      </button>

      <Link
        to="/"
        className="stm-logo"
        aria-label={t('steam-home', { defaultValue: 'RMH Studios home' })}
      >
        <img src="/favicon.svg" alt="" width={36} height={36} />
        <span>RMH Studios</span>
      </Link>

      <nav className="stm-nav" aria-label={t('steam-nav', { defaultValue: 'Main' })}>
        {items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            data-tab-current={tab === i.id ? 'true' : undefined}
            activeProps={{ 'aria-current': tab === i.id ? 'page' : undefined }}
          >
            {i.label}
            {i.id === 'community' && pending > 0 ? <PendingBadge n={pending} /> : null}
          </Link>
        ))}
      </nav>

      <div className="stm-user">
        {user ? (
          <Link to="/games/profile/$id" params={{ id: user.handle ?? user.id }}>
            {avatar}
            <span>{name}</span>
          </Link>
        ) : (
          <a href={`/login?callbackURL=${encodeURIComponent(pathname)}`}>
            {t('steam-sign-in', { defaultValue: 'Sign in' })}
          </a>
        )}
      </div>

      {/* Phones: the row collapses into this drawer, as in Steam's mobile app. */}
      <div id="stm-drawer" className="stm-drawer" data-open={open ? 'true' : 'false'} inert={!open}>
        <button
          type="button"
          className="stm-drawer-backdrop"
          tabIndex={-1}
          aria-label={t('steam-menu-close', { defaultValue: 'Close menu' })}
          onClick={() => setOpen(false)}
        />
        <nav className="stm-drawer-panel" aria-label={t('steam-nav', { defaultValue: 'Main' })}>
          <div className="stm-drawer-head">
            <Link to="/" className="stm-logo" onClick={() => setOpen(false)}>
              <img src="/favicon.svg" alt="" width={36} height={36} />
              <span>RMH Studios</span>
            </Link>
            <button
              type="button"
              className="stm-burger"
              aria-label={t('steam-menu-close', { defaultValue: 'Close menu' })}
              onClick={() => {
                setOpen(false);
                menuButton.current?.focus();
              }}
            >
              <X aria-hidden />
            </button>
          </div>
          {items.map((i, n) => (
            <Link
              key={i.to}
              to={i.to}
              ref={n === 0 ? firstLink : undefined}
              data-tab-current={tab === i.id ? 'true' : undefined}
              activeProps={{ 'aria-current': tab === i.id ? 'page' : undefined }}
            >
              {i.label}
              {i.id === 'community' && pending > 0 ? <PendingBadge n={pending} /> : null}
            </Link>
          ))}
          <hr />
          {user ? (
            <Link to="/games/profile/$id" params={{ id: user.handle ?? user.id }} className="stm-drawer-user">
              {avatar}
              <span>{name}</span>
            </Link>
          ) : (
            <a href={`/login?callbackURL=${encodeURIComponent(pathname)}`}>
              {t('steam-sign-in', { defaultValue: 'Sign in' })}
            </a>
          )}
          <Link to="/settings/privacy">{t('steam-playtime-settings', { defaultValue: 'Playtime settings' })}</Link>
          <Link to="/messages">{t('steam-friends-chat', { defaultValue: 'Friends & Chat' })}</Link>
        </nav>
      </div>
    </header>
  );
}

/** The count of trade offers waiting, as a small blue pill beside COMMUNITY. */
export function PendingBadge({ n }: { n: number }) {
  const { t } = useTranslation('games-hub');
  return (
    <span
      className="stm-nav-badge"
      role="status"
      aria-label={t('steam-pending-trades', { defaultValue: 'Pending trade offers: {{n}}', n })}
    >
      {n > 9 ? '9+' : n}
    </span>
  );
}

function SteamBottomBar() {
  const { t } = useTranslation('games-hub');
  return (
    <footer className="stm-bottombar">
      <Link to="/create/builds">
        <Plus aria-hidden />
        {t('steam-add-game', { defaultValue: 'Add a Game' })}
      </Link>
      <Link to="/settings/privacy">
        <Settings aria-hidden />
        {t('steam-playtime-settings', { defaultValue: 'Playtime settings' })}
      </Link>
      <Link to="/messages">
        <MessageSquare aria-hidden />
        {t('steam-friends-chat', { defaultValue: 'Friends & Chat' })}
      </Link>
    </footer>
  );
}
