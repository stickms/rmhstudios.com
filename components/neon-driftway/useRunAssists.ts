import { useCallback } from 'react';
import { api } from '@/lib/contract/client';
import { getAssistsApi } from '@/lib/game/assist.contract';
import { useAssistRun } from '@/components/games/assist-run';
import { NO_NDW_ASSIST, ndwAssistFlags, ndwOnlineFlags, type NdwAssistFlags } from '@/lib/neon-driftway/assist-profile';

/**
 * The assist flags for a Neon Driftway run about to start (a plain module, so the run-start
 * fetch stays out of the effect that mounts the renderer).
 *
 * A solo run claims itself on the server, which keeps an assisted run off the board, and gets
 * every assist. An online race makes no claim and reads the member's settings only for the two
 * visual assists. Any failure is the plain game; the server still unranks on submit.
 */
export function useRunAssists(signedIn: boolean) {
  const claim = useAssistRun('neon-driftway', signedIn);
  return useCallback(
    async (online: boolean): Promise<NdwAssistFlags> => {
      if (!signedIn) return NO_NDW_ASSIST;
      try {
        if (online) return ndwOnlineFlags((await api(getAssistsApi)).assists);
        return ndwAssistFlags(await claim());
      } catch {
        return NO_NDW_ASSIST;
      }
    },
    [signedIn, claim],
  );
}
