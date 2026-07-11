'use client';

import { Menu } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { useMobileSidebar } from './MobileSidebarShell';

/**
 * Mobile-only hamburger that opens the push sidebar. Use it in the top-left of a
 * page header on top-level browsing pages (it replaces the old back button,
 * which is unnecessary now that the sidebar is always one swipe/tap away).
 */
export function MobileMenuButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation("feed");
  const { open } = useMobileSidebar();
  return (
    <button
      onClick={open}
      className={`md:hidden -ml-2 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover active:scale-95 transition-[color,background-color,transform] shrink-0 ${className}`}
      aria-label={t("open-menu", { defaultValue: "Open menu" })}
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
