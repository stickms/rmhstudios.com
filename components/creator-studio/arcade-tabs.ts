/**
 * The Arcade section's sub-tabs, in their own module on purpose.
 *
 * `app/routes/_site/create/route.tsx` needs these in `validateSearch`, which is
 * part of the route DEFINITION — and route definitions are imported statically
 * by `routeTree.gen.ts`, i.e. they are in the entry chunk of every page. When
 * the constant lived in `ArcadeSection.tsx`, that import dragged the whole
 * Arcade component (and, with it, `creator-studio.css`) into every page's
 * render-blocking entry (perf audit 2026-10-08). Data the route config reads
 * belongs in a module with no UI in it.
 */
export const ARCADE_SUB_TABS = ['challenges', 'leaderboard'] as const;
export type ArcadeSubTab = (typeof ARCADE_SUB_TABS)[number];
