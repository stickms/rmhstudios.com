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
      className={`md:hidden inline-flex min-h-11 min-w-11 -ml-2 items-center justify-center rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors shrink-0 ${className}`}
      aria-label={t('open-menu', { defaultValue: 'Open menu' })}
      aria-controls="mobile-site-drawer"
      aria-expanded={isOpen}
    >
      <Menu className="w-5 h-5" aria-hidden />
    </button>
  );
}
