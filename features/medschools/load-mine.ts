import type { QueryClient } from '@tanstack/react-query';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { mineOfSearch, mineSlugs, schoolsParam, type MineChoice } from './engine/mine';
import { listsQuery, trackerQuery } from './medschools.queries';

// Loaded on demand by the /med and /med/live loaders, only when the URL names "My schools" (`mine=`, `list=`): the mine
// filter stays out of the shared entry every page downloads (check-bundle-budget).
export { mineOfSearch, schoolsParam };

/**
 * A loader's "My schools" step (owner 2026-11-24): when the URL names one (`mine=cycle`, `list=`) and the viewer is
 * signed in (`prefs` landed), await the private answer it needs so the server HTML is already filtered, then return
 * the slugs (`null`: no filter). Signed out it asks for nothing. A same-page change reads the cache and never waits.
 */
export async function loadMine(
  queryClient: QueryClient,
  choice: MineChoice | undefined,
  signedIn: boolean,
  cause?: 'enter' | 'stay' | 'preload',
): Promise<Set<string> | null> {
  if (!choice || !signedIn) return null;
  if (cause !== 'stay') {
    if (choice.kind === 'cycle') await prefetchRouteQuery(queryClient, trackerQuery());
    else await prefetchRouteQuery(queryClient, listsQuery());
  }
  return mineSlugs(
    choice,
    queryClient.getQueryData(trackerQuery().queryKey),
    queryClient.getQueryData(listsQuery().queryKey),
  );
}
