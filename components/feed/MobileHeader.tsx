'use client';

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

/*
 * `MobileTopBar` used to live here: a mobile-only "hamburger + RMH | title" card
 * for editorial/hero pages that had no header row of their own to host the menu
 * button. The radial redesign removed the push drawer it opened, which left the
 * card doing nothing but stacking a second, redundant title above each page's
 * own hero — so it is gone. Those pages now lead straight with their hero, and
 * the shell's top bar carries the RMH mark on every route.
 */
