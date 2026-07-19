'use client';

import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMobileSidebar } from './MobileSidebarShell';

/**
 * Mobile-only close button for the push drawer, mirroring MobileMenuButton.
 *
 * The drawer already closes on swipe and on tapping the scrim, but neither is
 * discoverable: the scrim is fully transparent (a dimming one bled behind
 * Safari's floating bar — see MobileSidebarShell), so there is no visible
 * "outside" to tap. This gives the gesture an explicit affordance.
 *
 * Safe to render outside MobileSidebarShell — useMobileSidebar's default
 * context is a no-op — but it's only meaningful inside the drawer.
 */
export function MobileSidebarCloseButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation('feed');
  const { close } = useMobileSidebar();
  return (
    <button
      onClick={close}
      className={`md:hidden inline-flex min-h-11 min-w-11 -mr-2 items-center justify-center rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors shrink-0 ${className}`}
      aria-label={t('close-menu', { defaultValue: 'Close menu' })}
    >
      <X className="w-5 h-5" />
    </button>
  );
}
