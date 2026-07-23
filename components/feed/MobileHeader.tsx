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
      <span className="shrink-0 font-(family-name:--site-font-display) text-xl font-semibold tracking-[-0.022em] text-site-accent max-[419px]:hidden md:hidden">
        RMH
      </span>
      <span
        className="h-5 w-px shrink-0 bg-site-border max-[419px]:hidden md:hidden"
        aria-hidden="true"
      />
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
    <div className="rounded-site border border-site-border bg-site-surface shadow-xs md:hidden">
      <div className="flex min-w-0 items-center gap-2 px-3 py-3 sm:px-4">
        <MobileMenuButton />
        <h1 className="flex min-w-0 items-center gap-2 font-(family-name:--site-font-display) text-2xl font-semibold tracking-[-0.022em] text-site-text">
          <MobileBrandPrefix />
          <span className="min-w-0 truncate">{title}</span>
        </h1>
      </div>
    </div>
  );
}
