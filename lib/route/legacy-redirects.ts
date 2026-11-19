/**
 * Old URLs that only forward somewhere else — one table instead of a route file
 * each (2026-11-19 consolidation audit).
 *
 * Every entry used to be its own file under `app/routes/` whose whole body was
 * `beforeLoad: () => { throw redirect(...) }`. The root route reads this table
 * in its `beforeLoad` (`app/routes/__root.tsx`), which runs for every
 * navigation, on the server and in the client, so an old link still lands in
 * the right place however it is followed: a shared URL gets a 301 from SSR,
 * and an in-app link that still names an old path is forwarded by the router.
 *
 * Keys are exact pathnames with no trailing slash; values are the full target
 * (path, search and hash). A redirect that carries part of the request along
 * (a path param or the query string) stays a route file:
 * `/search`, `/profile/$id`, `/sohumbum2/$date`.
 */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  // Folded into tabs of a hub page.
  '/bookmarks': '/saves?tab=saved',
  '/lists': '/saves?tab=lists',
  '/wishlist': '/saves?tab=wishlist',
  '/shop': '/store?tab=shop',
  '/market': '/store?tab=market',
  '/pricing': '/store?tab=membership',
  '/events': '/communities?tab=events',
  '/spaces': '/communities?tab=spaces',
  '/notifications': '/messages?tab=notifications',
  '/leaderboard': '/compete?tab=leaderboard',
  '/playlists': '/library?view=playlists',
  '/blog': '/library',
  '/homes/saved': '/homes/manage?tab=saved',
  '/homes/watches': '/homes/manage?tab=alerts',
  '/admin/library-quota': '/admin/library?tab=appeals',
  '/admin/library-storage': '/admin/library?tab=storage',
  '/achievements': '/progress?tab=achievements',
  '/recap': '/progress?tab=week',
  '/wrapped': '/progress?tab=year',
  '/today': '/progress?tab=today',
  '/ranked': '/compete?tab=ranked',
  '/tournaments': '/compete?tab=tournaments',
  '/speedruns': '/compete?tab=speedruns',
  '/wager': '/compete?tab=wagers',
  '/daily-mutator': '/daily?tab=mutator',
  '/connections': '/daily?tab=connections',
  // The Steam-framed copy of the Store's daily rotation (it said so itself).
  '/games/daily': '/store?tab=daily',
  // Settings that became a section of another settings page.
  '/settings/account-status': '/settings/security#account-status',
  '/settings/calendar': '/settings/notifications#calendar',
  '/settings/circle': '/settings/privacy#close-friends',
  '/studio/themes': '/settings/themes',
  // Catalogs and creator pages that moved.
  '/apps': '/games?kind=app',
  '/builds': '/games',
  '/user-builds': '/games',
  '/v': '/create',
  '/personas': '/create/personas',
  '/creator-studio': '/create/earnings',
  // Pages that were renamed or moved.
  '/alexdebtcounter': '/kaikaidebtcounter',
  '/sohumbum2': '/sohumtracker',
  '/lights-out': '/daily/lights-out',
  '/covid': '/rmh-research/reports/feature-leak',
  '/optimization': '/rmh-research/reports/optimization',
};

/** The target for a legacy pathname, or null when the path is current. */
export function legacyRedirectFor(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return LEGACY_REDIRECTS[path] ?? null;
}
