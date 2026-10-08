'use client';

/**
 * The behaviour every microsite nav shares (K1).
 *
 * ## What this extracts, and what it deliberately does not
 *
 * The plan document sketched K1 as a component kit — "masthead, hero, section,
 * stat row, CTA, contact, parameterised by a token group". Reading the six
 * microsites first says that is the wrong shape, and building it would have
 * produced an abstraction two of them use and four fight:
 *
 *   - **RMH Datacenter** was already moved onto the site's own design language
 *     (`components/rmh-datacenter/parts.tsx` builds on `components/ui/card` and
 *     `--site-*`), so it duplicates nothing.
 *   - **Rebar & Rutabaga** has its own `--rebar-*` material on purpose, and a
 *     shared visual component there would undo the thing that page is.
 *   - **RMH Capital** and **RMH PMC** look nothing alike — a markets ticker and
 *     a gold hexagon against a transmission log and a decrypt effect.
 *
 * What those last two DO share, character for character, is the behaviour:
 * condense the bar past 12px of scroll, toggle a mobile menu and keep
 * `aria-expanded` in step, close it on navigate, and mark the current link.
 * Two copies of that, differing only in a CSS class prefix and an i18n
 * namespace.
 *
 * So this is the behaviour, and the markup and material stay where they are.
 * A hook cannot be "fought" by a site with its own look, which is exactly why
 * it is the part worth sharing.
 */

import { useCallback, useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';

export interface VerticalNavOptions {
  /** Root class scoping this microsite, e.g. `rmhc-root`. */
  rootClass: string;
  /** The bar's own class, e.g. `topnav` or `cmdbar`. */
  barClass: string;
  /** Scroll depth, in px, at which the bar condenses. */
  condenseAt?: number;
}

export interface VerticalNav {
  /** `onClick` for the hamburger. Toggles the menu and `aria-expanded`. */
  toggleMenu: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** `onClick` for every link in the mobile menu. */
  closeMenu: () => void;
  /** `aria-current` for a link: `'page'` when it is the one you are on. */
  current: (to: string) => 'page' | undefined;
}

export function useVerticalNav({
  rootClass,
  barClass,
  condenseAt = 12,
}: VerticalNavOptions): VerticalNav {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const bar = document.querySelector(`.${rootClass} .${barClass}`);
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > condenseAt);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [rootClass, barClass, condenseAt]);

  // Close the mobile menu whenever the route changes. Both copies of this
  // relied on every link calling `closeMenu` by hand, which works until one
  // link forgets — and then the menu stays open over the page it navigated to.
  useEffect(() => {
    document.querySelector(`.${rootClass} .mobile-menu`)?.classList.remove('open');
    document
      .querySelector(`.${rootClass} .${barClass} [aria-expanded="true"]`)
      ?.setAttribute('aria-expanded', 'false');
  }, [pathname, rootClass, barClass]);

  const toggleMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const menu = btn.closest(`.${barClass}`)?.querySelector('.mobile-menu');
    if (!menu) return;
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }, [barClass]);

  const closeMenu = useCallback(() => {
    document.querySelector(`.${rootClass} .mobile-menu`)?.classList.remove('open');
  }, [rootClass]);

  const current = useCallback(
    (to: string): 'page' | undefined => (pathname === to ? 'page' : undefined),
    [pathname],
  );

  return { toggleMenu, closeMenu, current };
}
