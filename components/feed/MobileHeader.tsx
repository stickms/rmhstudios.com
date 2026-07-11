'use client';

import { MobileMenuButton } from './MobileMenuButton';

/**
 * Mobile-only "RMH |" brand prefix shown before a page's title. Place it inside
 * the flex container that holds the title text so the divider lines up. Hidden
 * on desktop (≥ md), where the left sidebar already carries the branding.
 */
export function MobileBrandPrefix() {
  return (
    <>
      <span className="md:hidden font-(family-name:--site-font-display) font-semibold text-xl tracking-[-0.022em] text-site-accent shrink-0">
        RMH
      </span>
      <span className="md:hidden w-px h-5 bg-site-border shrink-0" aria-hidden="true" />
    </>
  );
}

/**
 * Mobile-only top bar (hamburger + "RMH | title") for editorial/hero pages that
 * don't otherwise have a header row to host the menu button (e.g. Pages,
 * Membership). Entirely hidden on desktop, which uses the fixed left sidebar.
 */
export function MobileTopBar({ title }: { title: string }) {
  return (
    <div className="vibe-glass md:hidden border-b border-site-border">
      <div className="flex items-center gap-2 px-4 py-3">
        <MobileMenuButton />
        <h1 className="flex items-center gap-2 font-(family-name:--site-font-display) font-semibold text-2xl tracking-[-0.022em] text-site-text min-w-0">
          <MobileBrandPrefix />
          <span className="truncate">{title}</span>
        </h1>
      </div>
    </div>
  );
}
