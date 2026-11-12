import { useCallback, useRef, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';

interface AccountMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  profileHref: string;
}

/**
 * The signed-in handle's menu: everything the old top bar's profile panel held (Profile, Wallet, Settings, Sign out),
 * plus the way to the sections the five words do not name. One overlay (S5); rows are words.
 */
export function AccountMenu({ open, onClose, anchorRef, profileHref }: AccountMenuProps) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const signingOut = useRef(false);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    // Loaded on the click: the auth client (and its passkey and Stripe plugins) stays off every page that only reads
    // who is signed in (third-pass audit RT1).
    try {
      const { authClient } = await import('@/lib/auth-client');
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            onClose();
            void navigate({ to: '/' });
            window.location.reload();
          },
        },
      });
    } finally {
      // Also when the chunk could not be fetched: the next click tries again.
      signingOut.current = false;
    }
  }, [navigate, onClose]);

  return (
    <AnchoredMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label={t('shell-account-menu-label', { defaultValue: 'Account' })}
      side="top"
      align="start"
    >
      <MenuItem href={profileHref} onClick={onClose}>
        {t('profile', { defaultValue: 'Profile' })}
      </MenuItem>
      <MenuItem href="/predictions" onClick={onClose}>
        {t('nav-wallet', { defaultValue: 'Wallet' })}
      </MenuItem>
      <MenuItem href="/settings" onClick={onClose}>
        {t('settings', { defaultValue: 'Settings' })}
      </MenuItem>
      <MenuItem href="/sections" onClick={onClose}>
        {t('shell-all-sections', { defaultValue: 'All sections' })}
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={signOut}>{t('sign-out', { defaultValue: 'Sign out' })}</MenuItem>
    </AnchoredMenu>
  );
}
