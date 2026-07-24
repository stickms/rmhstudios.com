'use client';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Bell, LogOut, Settings, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
import { MobileSidebarCloseButton } from './MobileSidebarCloseButton';

type DrawerUser = {
  id: string;
  handle?: string | null;
  isAdmin?: boolean;
};

/**
 * Expanded navigation index for the social shell. Primary navigation remains
 * visible in SiteNavigation; this drawer exposes the platform's deeper routes.
 */
export function LeftSidebar() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as DrawerUser | undefined;

  const visible = SIDEBAR_NAV.filter((item) => {
    if (isNavGroup(item)) return true;
    if (item.requiresAuth && !session) return false;
    if (item.requiresAdmin && !user?.isAdmin) return false;
    return true;
  });

  const renderLeaf = (item: NavLeaf) => {
    const Icon = item.icon;
    const active =
      pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
    const label = t(item.tKey, { defaultValue: item.label });
    const className = 'drawer-nav__link' + (active ? ' drawer-nav__link--active' : '');

    return item.external ? (
      <a
        key={item.href}
        href={item.href}
        className={className}
        aria-current={active ? 'page' : undefined}
      >
        <Icon aria-hidden />
        <span>{label}</span>
      </a>
    ) : (
      <Link
        key={item.href}
        to={item.href}
        className={className}
        aria-current={active ? 'page' : undefined}
      >
        <Icon aria-hidden />
        <span>{label}</span>
      </Link>
    );
  };

  const signOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: '/' });
          window.location.reload();
        },
      },
    });
  };

  return (
    <div className="drawer-nav">
      <div className="drawer-nav__head">
        <Link to="/" className="drawer-nav__brand">
          <span>RMH</span>
          <small>{t('studio-wordmark', { defaultValue: 'Studios' })}</small>
        </Link>
        <MobileSidebarCloseButton />
      </div>

      <p className="drawer-nav__eyebrow">{t('navigation-index', { defaultValue: 'Index' })}</p>

      <nav className="drawer-nav__list" aria-label={t('open-menu', { defaultValue: 'Navigation' })}>
        {visible.map((item) =>
          isNavGroup(item) ? (
            <div key={item.id} className="drawer-nav__group">
              <p>{t(item.tKey, { defaultValue: item.label })}</p>
              {item.children.map(renderLeaf)}
            </div>
          ) : (
            renderLeaf(item)
          ),
        )}
      </nav>

      <div className="drawer-nav__footer">
        {isPending ? (
          <div className="drawer-nav__loading" aria-hidden />
        ) : session && user ? (
          <>
            <Link to={`/u/${user.handle || user.id}` as string} className="drawer-nav__identity">
              <UserAvatar
                src={resolved?.image || session.user.image}
                alt={
                  resolved?.name ||
                  session.user.name ||
                  t('user-avatar-alt', { defaultValue: 'User' })
                }
                size={36}
                fallbackName={resolved?.name || session.user.name}
              />
              <span>{resolved?.name || session.user.name}</span>
            </Link>
            <div className="drawer-nav__utility">
              <Link
                to="/notifications"
                aria-label={t('notifications', { defaultValue: 'Notifications' })}
              >
                <Bell aria-hidden />
              </Link>
              <Link to="/settings" aria-label={t('settings', { defaultValue: 'Settings' })}>
                <Settings aria-hidden />
              </Link>
              <button
                type="button"
                onClick={signOut}
                aria-label={t('sign-out', { defaultValue: 'Sign out' })}
              >
                <LogOut aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <Link to="/login" search={{ callbackURL: undefined }} className="drawer-nav__signin">
            <User aria-hidden />
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        )}
      </div>
    </div>
  );
}
