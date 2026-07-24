'use client';

import { Link, useLocation } from '@tanstack/react-router';
import {
  Bell,
  BookOpen,
  Compass,
  Gamepad2,
  MessageCircle,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MobileMenuButton } from './MobileMenuButton';

const SECTION_TABS = [
  { href: '/', id: 'feed' },
  { href: '/search', id: 'explore' },
  { href: '/communities', id: 'communities' },
  { href: '/arcade', id: 'arcade' },
  { href: '/library', id: 'library' },
  { href: '/create', id: 'create' },
  { href: '/study', id: 'learn' },
  { href: '/news', id: 'news' },
  { href: '/store', id: 'store' },
  { href: '/services', id: 'services' },
] as const;

type SectionId = (typeof SECTION_TABS)[number]['id'];

type NavUser = {
  id: string;
  handle?: string | null;
};

function isActivePath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mobile-first global navigation.
 *
 * The first row holds identity and high-value utilities. The second row is a
 * real, horizontally scrollable route index that remains available on every
 * standard page instead of disappearing behind a mobile menu.
 */
export function SiteNavigation() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as NavUser | undefined;
  const profileHref = user ? `/u/${user.handle || user.id}` : '/login';
  const sectionLabels: Record<SectionId, string> = {
    feed: t('tab-feed', { defaultValue: 'Feed' }),
    explore: t('tab-explore', { defaultValue: 'Explore' }),
    communities: t('tab-communities', { defaultValue: 'Communities' }),
    arcade: t('tab-arcade', { defaultValue: 'Arcade' }),
    library: t('tab-library', { defaultValue: 'Library' }),
    create: t('tab-create', { defaultValue: 'Create' }),
    learn: t('tab-learn', { defaultValue: 'Learn' }),
    news: t('tab-news', { defaultValue: 'News' }),
    store: t('tab-store', { defaultValue: 'Store' }),
    services: t('tab-services', { defaultValue: 'Services' }),
  };

  return (
    <header className="site-nav">
      <div className="site-nav__bar">
        <div className="site-nav__identity">
          <MobileMenuButton className="site-nav__menu" />
          <Link
            to="/"
            className="site-nav__brand"
            aria-label={t('nav-home', { defaultValue: 'RMH Studios home' })}
          >
            <span className="site-nav__mark" aria-hidden>
              R
            </span>
            <span className="site-nav__wordmark">
              <strong>RMH</strong>
              <small>{t('studio-wordmark', { defaultValue: 'Studios' })}</small>
            </span>
          </Link>
        </div>

        <div className="site-nav__utilities">
          <Link
            to="/search"
            search={{ q: '', tab: 'top' }}
            className="site-nav__utility"
            aria-label={t('nav-explore', { defaultValue: 'Search and explore' })}
          >
            <Search aria-hidden />
          </Link>
          {session && (
            <>
              <Link
                to="/messages"
                className="site-nav__utility max-sm:hidden"
                aria-label={t('messages', { defaultValue: 'Messages' })}
              >
                <MessageCircle aria-hidden />
              </Link>
              <Link
                to="/notifications"
                className="site-nav__utility"
                aria-label={t('notifications', { defaultValue: 'Notifications' })}
              >
                <Bell aria-hidden />
              </Link>
            </>
          )}
          <Link
            to={profileHref as string}
            search={session ? undefined : { callbackURL: undefined }}
            className="site-nav__profile"
            aria-label={
              session
                ? t('profile', { defaultValue: 'Profile' })
                : t('sign-in', { defaultValue: 'Sign in' })
            }
          >
            {session ? (
              <UserAvatar
                src={resolved?.image || session.user.image}
                alt={
                  resolved?.name ||
                  session.user.name ||
                  t('user-avatar-alt', { defaultValue: 'User' })
                }
                size={34}
                fallbackName={resolved?.name || session.user.name}
              />
            ) : (
              <span>{t('sign-in', { defaultValue: 'Sign in' })}</span>
            )}
          </Link>
        </div>
      </div>

      <nav
        className="site-nav__tabs"
        aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
      >
        {SECTION_TABS.map(({ href, id }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              to={href}
              className="site-nav__tab"
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
            >
              {sectionLabels[id]}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

type DockLink = {
  href: string;
  id: SectionId;
  icon: typeof BookOpen;
  primary?: boolean;
};

const DOCK_LINKS: readonly DockLink[] = [
  { href: '/', id: 'feed', icon: BookOpen },
  { href: '/search', id: 'explore', icon: Compass },
  { href: '/create', id: 'create', icon: Plus, primary: true },
  { href: '/communities', id: 'communities', icon: Users },
  { href: '/arcade', id: 'arcade', icon: Gamepad2 },
];

/** Thumb-reachable primary navigation for phones. */
export function MobileDock() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const dockLabels: Record<(typeof DOCK_LINKS)[number]['id'], string> = {
    feed: t('tab-feed', { defaultValue: 'Feed' }),
    explore: t('tab-explore', { defaultValue: 'Explore' }),
    create: t('tab-create', { defaultValue: 'Create' }),
    communities: t('tab-communities', { defaultValue: 'Communities' }),
    arcade: t('tab-arcade', { defaultValue: 'Arcade' }),
    library: t('tab-library', { defaultValue: 'Library' }),
    learn: t('tab-learn', { defaultValue: 'Learn' }),
    news: t('tab-news', { defaultValue: 'News' }),
    store: t('tab-store', { defaultValue: 'Store' }),
    services: t('tab-services', { defaultValue: 'Services' }),
  };

  return (
    <nav
      className="mobile-dock"
      aria-label={t('mobile-navigation', { defaultValue: 'Primary mobile navigation' })}
    >
      {DOCK_LINKS.map(({ href, id, icon: Icon, primary }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            to={href}
            className="mobile-dock__link"
            data-active={active || undefined}
            data-primary={primary || undefined}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden />
            <span>{dockLabels[id]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
