'use client';

import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMobileSidebar } from './MobileSidebarShell';

/**
 * Mobile-only hamburger that opens the push sidebar. Use it in the top-left of a
 * page header on top-level browsing pages (it replaces the old back button,
 * which is unnecessary now that the sidebar is always one swipe/tap away).
 */
export function MobileMenuButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation('feed');
  const { isOpen, open } = useMobileSidebar();
  return (
    <button
      type="button"
      data-mobile-menu-trigger=""
      onClick={open}
      className={`-ml-2 inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-site text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text active:bg-site-surface-active md:hidden ${className}`}
      aria-label={t('open-menu', { defaultValue: 'Open menu' })}
      aria-controls="mobile-site-drawer"
      aria-expanded={isOpen}
    >
      <Menu className="size-5" aria-hidden />
    </button>
  );
}
