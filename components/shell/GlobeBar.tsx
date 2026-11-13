import { Link } from '@tanstack/react-router';
import { LayoutGrid, LogIn, LogOut, Moon, Search, Settings, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { openCommandPalette } from '@/components/site/command-palette-bus';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useThemeStore } from '@/stores/themeStore';
import { viewerPathFor } from './sections';

interface GlobeBarProps {
  /** The menu is showing. Closed, the bar is inert and not displayed. */
  open: boolean;
  /** Bring the globe home: every item does, before it does its own thing. */
  onClose: () => void;
}

/**
 * The bar under the open globe (Steel G3a; owner, 2026-11-13: "when the liquid globe is open re-add something like our
 * old bottom bar with log in/settings/etc"). The pins are places; this is the account: who is signed in (the avatar is
 * the link to their profile, which is how "You" is reached on a phone), or Sign in; search; settings; the edition; every
 * section as a list; and Sign out. It replaces the two text links that hung under the globe ("Write a post" is gone
 * from the menu, "All sections" is an item here).
 *
 * One flat row of icons with short labels on a pill: the overlay surface and its border, no shadow. Every item is a 44px target. It exists
 * only while the menu is open (it fades with it, opacity only), floats above the safe area by the docked globe's own
 * inset rule, and on a window too short to hold it under the globe it is a column of icons at the inline end instead
 * (globe-nav.css). It comes after the pins in the tab order; Escape closes the menu from it as from anywhere.
 */
export function GlobeBar({ open, onClose }: GlobeBarProps) {
  const { t } = useTranslation('feed');
  const { data: session, isPending: sessionUnknown } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as
    { id: string; handle?: string | null; name?: string | null; image?: string | null } | undefined;
  const viewerPath = viewerPathFor(user);
  const style = useThemeStore((s) => s.style);
  const setStyle = useThemeStore((s) => s.setStyle);
  const night = style === 'graphite';

  const signOut = () => {
    onClose();
    // Loaded on the press: the auth client stays off every page that only reads who is signed in (audit RT1).
    void import('@/lib/auth-client').then(({ authClient }) =>
      authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } }),
    );
  };

  const name = resolved?.name || user?.name || t('shell-you-fallback', { defaultValue: 'You' });
  const item = { className: 'globe-nav__bar-item', 'data-globe-stop': '' } as const;

  return (
    <div
      className="globe-nav__bar"
      role="group"
      aria-label={t('shell-account-menu-label', { defaultValue: 'Account' })}
      inert={!open}
    >
      {user && viewerPath ? (
        <Link
          to={viewerPath}
          {...item}
          aria-label={t('shell-your-profile', { defaultValue: 'Your profile, {{name}}', name })}
          onClick={onClose}
        >
          <UserAvatar src={resolved?.image || user.image} alt="" size={22} fallbackName={name} />
          <span className="globe-nav__bar-label">{t('profile', { defaultValue: 'Profile' })}</span>
        </Link>
      ) : sessionUnknown ? null : (
        <Link to="/login" search={{ callbackURL: undefined }} {...item} onClick={onClose}>
          <LogIn aria-hidden />
          <span className="globe-nav__bar-label">{t('shell-sign-in', { defaultValue: 'Sign in' })}</span>
        </Link>
      )}
      <button
        type="button"
        {...item}
        onClick={() => {
          onClose();
          openCommandPalette();
        }}
      >
        <Search aria-hidden />
        <span className="globe-nav__bar-label">{t('search', { defaultValue: 'Search' })}</span>
      </button>
      <Link to="/settings" {...item} onClick={onClose}>
        <Settings aria-hidden />
        <span className="globe-nav__bar-label">{t('settings', { defaultValue: 'Settings' })}</span>
      </Link>
      <button
        type="button"
        {...item}
        aria-label={
          night
            ? t('shell-edition-to-day', { defaultValue: 'Switch to the Day edition' })
            : t('shell-edition-to-night', { defaultValue: 'Switch to the Night edition' })
        }
        onClick={() => setStyle(night ? 'default' : 'graphite')}
      >
        {night ? <Sun aria-hidden /> : <Moon aria-hidden />}
        <span className="globe-nav__bar-label">
          {night
            ? t('shell-edition-day', { defaultValue: 'Day' })
            : t('shell-edition-night', { defaultValue: 'Night' })}
        </span>
      </button>
      <Link to="/sections" {...item} onClick={onClose}>
        <LayoutGrid aria-hidden />
        <span className="globe-nav__bar-label">{t('shell-all-sections', { defaultValue: 'All sections' })}</span>
      </Link>
      {user ? (
        <button type="button" {...item} onClick={signOut}>
          <LogOut aria-hidden />
          <span className="globe-nav__bar-label">{t('sign-out', { defaultValue: 'Sign out' })}</span>
        </button>
      ) : null}
    </div>
  );
}
