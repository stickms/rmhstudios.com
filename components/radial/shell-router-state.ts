/**
 * What the radial shell reads from router state — and nothing more.
 *
 * `useLocation()` subscribes to the whole `location` object, which the router
 * replaces on EVERY navigation (a search-param or hash change included), and
 * router updates run through `useSyncExternalStore`, so they cannot be
 * time-sliced: each subscriber re-renders synchronously. The shell's chrome
 * (nav rail, hub, globe dock, top bar) only ever needs the pathname, so each
 * reads it through these selectors, which return a primitive string and so
 * bail out of a re-render unless the path itself changed
 * (docs/plans/2026-11-09-ground-up-redesign-audit.md, B7).
 *
 * The selectors are pure so a test can pin their referential stability without
 * mounting a router.
 */

import { useRouterState } from '@tanstack/react-router';

/** The slice of router state the shell's selectors read. */
export interface ShellRouterState {
  location: { pathname: string; href: string };
  resolvedLocation?: { pathname: string; href: string } | undefined;
}

/** The URL's pathname — moves the instant a navigation starts. */
export const selectPathname = (s: ShellRouterState): string => s.location.pathname;

/** The pathname of the page actually ON SCREEN (moves with the commit, not the URL). */
export const selectRenderedPathname = (s: ShellRouterState): string =>
  (s.resolvedLocation ?? s.location).pathname;

/** The href of the page actually ON SCREEN. */
export const selectRenderedHref = (s: ShellRouterState): string =>
  (s.resolvedLocation ?? s.location).href;

export const usePathname = (): string => useRouterState({ select: selectPathname });
export const useRenderedPathname = (): string =>
  useRouterState({ select: selectRenderedPathname });
export const useRenderedHref = (): string => useRouterState({ select: selectRenderedHref });
