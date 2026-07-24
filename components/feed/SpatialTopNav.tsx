'use client';

import { Link, useLocation } from '@tanstack/react-router';
import { Grid2X2, Library, Search, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MobileMenuButton } from './MobileMenuButton';

const PRIMARY_LINKS = [
  { href: '/search', key: 'nav-explore', label: 'Explore', icon: Search },
  { href: '/create', key: 'nav-creator-studio', label: 'Create', icon: Sparkles },
  { href: '/library', key: 'nav-library', label: 'Library', icon: Library },
  { href: '/arcade', key: 'nav-arcade', label: 'Arcade', icon: Grid2X2 },
] as const;

type NavUser = {
  id: string;
  handle?: string | null;
};

/**
 * The redesigned site has one global navigation plane. It replaces the old
 * permanent desktop sidebar and keeps the first viewport focused on content.
 */
export function SpatialTopNav() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as NavUser | undefined;
  const profileHref = user ? `/u/${user.handle || user.id}` : '/login';

  return (
    <header className="spatial-nav-wrap">
      <nav
        className="spatial-nav"
        aria-label={t('open-menu', { defaultValue: 'Primary navigation' })}
      >
        <div className="spatial-nav__brand">
          <MobileMenuButton className="spatial-nav__menu" />
          <Link
            to="/"
            className="spatial-nav__wordmark"
            aria-label={t('nav-home', { defaultValue: 'RMH Studios home' })}
          >
            <span aria-hidden>RMH</span>
            <span>{t('studio-wordmark', { defaultValue: 'Studios' })}</span>
          </Link>
        </div>

        <div className="spatial-nav__links">
          {PRIMARY_LINKS.map(({ href, key, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                to={href}
                className="spatial-nav__link"
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden />
                <span>{t(key, { defaultValue: label })}</span>
              </Link>
            );
          })}
        </div>

        <div className="spatial-nav__account">
          <span className="spatial-nav__edition" aria-hidden>
            26 / 01
          </span>
          <Link
            to={profileHref as string}
            search={session ? undefined : { callbackURL: undefined }}
            className="spatial-nav__profile"
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
                size={30}
                fallbackName={resolved?.name || session.user.name}
              />
            ) : (
              <span>{t('sign-in', { defaultValue: 'Sign in' })}</span>
            )}
          </Link>
        </div>
      </nav>
    </header>
  );
}
