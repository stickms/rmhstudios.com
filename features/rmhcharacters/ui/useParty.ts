/** Reads for the party screens: React Query over the typed contracts (never a fetch in an effect). */
import { useQuery } from '@tanstack/react-query';
import { apiQuery } from '@/lib/contract/client';
import { PARTY_REFETCH_MS } from '@features/rmhcharacters/engine/party-limits';
import {
  getPartyApi,
  listPartiesApi,
  previewPartyJoinApi,
  readPartySheetApi,
} from '@features/rmhcharacters/engine/party.contract';

export const partyListKey = apiQuery(listPartiesApi).queryKey;

export function usePartyList() {
  return useQuery({ ...apiQuery(listPartiesApi), staleTime: 10_000 });
}

/**
 * One party. Asks again every 20 seconds while the page is visible (`refetchIntervalInBackground: false` pauses it
 * while the document is hidden) and when the window regains focus. No socket.
 */
export function useParty(id: string) {
  return useQuery({
    ...apiQuery(getPartyApi, { params: { id } }),
    refetchInterval: PARTY_REFETCH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export const partyKey = (id: string) => apiQuery(getPartyApi, { params: { id } }).queryKey;

export function useJoinPreview(code: string) {
  return useQuery({ ...apiQuery(previewPartyJoinApi, { query: { code } }), retry: false });
}

/** A shared sheet is never kept: it is read on open and dropped when the viewer closes. */
export function usePartySheet(id: string, userId: string) {
  return useQuery({
    ...apiQuery(readPartySheetApi, { params: { id, userId } }),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}
