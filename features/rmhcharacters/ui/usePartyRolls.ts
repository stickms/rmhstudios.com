/** Reads and writes for the table's roll log: React Query over the typed contracts (never a fetch in an effect). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/shared/app-toast';
import { PARTY_ROLL_POLL_MS, type PartyRoll, type RollBody } from '@features/rmhcharacters/engine/party-rolls';
import { listPartyRollsApi, rollForPartyApi } from '@features/rmhcharacters/engine/party-rolls.contract';

export const partyRollsKey = (id: string) => apiQuery(listPartyRollsApi, { params: { id } }).queryKey;

/**
 * The newest rolls the viewer may see. Asks again every 5 seconds while the page is visible
 * (`refetchIntervalInBackground: false` pauses it while the document is hidden); one indexed query a poll.
 */
export function usePartyRolls(id: string) {
  return useQuery({
    ...apiQuery(listPartyRollsApi, { params: { id } }),
    refetchInterval: PARTY_ROLL_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/** An older page of the log, read from a click (`after` is the cursor the last page gave). */
export const readEarlierRolls = (id: string, after: string) =>
  api(listPartyRollsApi, { params: { id }, query: { after } });

/** Roll for the table: the body names what to roll; the server computes the modifier and the result. */
export function useRollForTable(partyId: string, onRolled?: (roll: PartyRoll) => void) {
  const queryClient = useQueryClient();
  const refusalText = useRefusalText();
  return useMutation({
    mutationFn: (body: RollBody) => api(rollForPartyApi, { params: { id: partyId }, body }),
    onSuccess: (roll) => {
      onRolled?.(roll);
      void queryClient.invalidateQueries({ queryKey: partyRollsKey(partyId) });
    },
    onError: (error: unknown) => toast.error(refusalText(error)),
  });
}
