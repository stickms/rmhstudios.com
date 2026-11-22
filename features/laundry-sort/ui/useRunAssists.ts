import { useCallback } from 'react';
import { api } from '@/lib/contract/client';
import { getAssistsApi } from '@/lib/game/assist.contract';
import { useAssistRun } from '@/components/games/assist-run';
import {
  NO_LAUNDRY_ASSIST,
  laundryAssistFlags,
  laundryVersusFlags,
  type LaundryAssistFlags,
} from '@features/laundry-sort/engine/assist-profile';

/**
 * The assist flags for a Laundry Sort round about to start (a plain module, so the run-start
 * fetch stays out of the effects that build the match).
 *
 * A solo round claims itself on the server, which keeps an assisted run off the board, and gets
 * colour-safe and the untimed round. A versus round makes no claim (the hub writes its results,
 * and its clock is shared) and reads the member's settings only for colour-safe. Any failure is
 * the plain game; the server still unranks on submit.
 */
export function useRunAssists(signedIn: boolean) {
  const claim = useAssistRun('laundry-sort', signedIn);
  return useCallback(
    async (versus: boolean): Promise<LaundryAssistFlags> => {
      if (!signedIn) return NO_LAUNDRY_ASSIST;
      try {
        if (versus) return laundryVersusFlags((await api(getAssistsApi)).assists);
        return laundryAssistFlags(await claim());
      } catch {
        return NO_LAUNDRY_ASSIST;
      }
    },
    [signedIn, claim],
  );
}
