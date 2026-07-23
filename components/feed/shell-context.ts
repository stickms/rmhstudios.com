import { createContext } from'react';

/**
 * True when a subtree renders inside the `_site`shell (left sidebar + center
 * column + right-sidebar gutter), as opposed to a full-screen route (games,
 * apps, login, legal).
 *
 * The router's pending fallback (`components/ui/RoutePending.tsx`) reads this to
 * pick a layout-matched skeleton for shell pages instead of a generic centered
 * one — so a slow shell route swaps its real content in without a layout shift.
 * Router state can't answer this during the pending phase (the destination sits
 * in an unexposed `pendingMatches`store), but the pending element renders as a
 * Suspense fallback under `SiteLayout`'s `<Outlet>`, so this context reaches it.
 */
export const ShellLayoutContext = createContext(false);
