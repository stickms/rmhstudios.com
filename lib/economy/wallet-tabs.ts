/**
 * /wallet tab ids. Kept apart from `WalletPage` on purpose: the route module
 * needs them for `validateSearch`, and every route module is in the client
 * entry's static closure (the generated route tree imports them all), so
 * importing them from the page component would pull the whole wallet UI into
 * the bundle every page loads.
 */
export const WALLET_TABS = ['goals', 'statement', 'community', 'gifts'] as const;
export type WalletTab = (typeof WALLET_TABS)[number];
