/**
 * Is the coin-risking half of the site hidden from this member (self-excluded)?
 *
 * One tiny query, shared by every menu, list and shortcut that would otherwise link `/predictions` or the wagers
 * (`lib/economy/risk-surfaces.ts`). It is `false` signed out, before the answer arrives and on any failure, so the
 * server render and the first paint use the default lists and the shell never mismatches at hydration (as the layout
 * store's lists already do). Cool-off does not hide anything; only self-exclusion does.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { apiQuery } from '@/lib/contract/client';
import { getRiskSurfacesApi } from '@/lib/economy/play-limits.contract';

/** The query behind the hook. Its key is `[contract.path, null, null]`, like every `apiQuery`. */
export const riskSurfacesQuery = () => ({
  ...apiQuery(getRiskSurfacesApi),
  staleTime: 60_000,
  retry: false,
});

/**
 * Put the answer in the cache after the member changed a limit. The settings save already returns `surfacesHidden`,
 * so nothing is refetched (the endpoint's private cache header would let the browser answer a refetch with the old
 * value for up to a minute).
 */
export function setRiskSurfacesHidden(queryClient: QueryClient, hidden: boolean): void {
  queryClient.setQueryData(riskSurfacesQuery().queryKey, { hidden });
}

export function useRiskSurfacesHidden(): boolean {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const { data } = useQuery({ ...riskSurfacesQuery(), enabled: signedIn });
  return signedIn && data?.hidden === true;
}
