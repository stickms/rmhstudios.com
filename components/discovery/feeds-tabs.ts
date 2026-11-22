/**
 * The `/feeds` tabs, on their own so the route's `validateSearch` can read them without the page: a route module is
 * on every page's critical path, and importing the list from `FeedsPage.tsx` put that page and everything it imports
 * (the lists manager, saved searches, the feed form, the discovery settings) in the entry chunk.
 */
export const FEEDS_TABS = ['feeds', 'lists', 'searches', 'alerts'] as const;
export type FeedsTab = (typeof FEEDS_TABS)[number];
