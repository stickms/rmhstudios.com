import { useCallback } from 'react';
import { api } from '@/lib/contract/client';
import { getAssistsApi } from '@/lib/game/assist.contract';
import { useAssistRun } from '@/components/games/assist-run';
import {
  NO_ASSIST_FLAGS,
  dreamRiftAssistFlags,
  dreamRiftCoopFlags,
  type DreamRiftAssistFlags,
} from '@features/dream-rift/engine/assist-profile';

/**
 * The assist flags for a Dream Rift run about to start (a plain module, not a
 * component, so the run-start fetch stays out of the effect that mounts the stage).
 *
 * Solo, practice and the seeded daily claim the run on the server and get every
 * assist. Co-op shares one sim, so it makes no claim and reads the member's
 * settings only for the two presentational assists. Any failure is the plain game.
 */
export function useRunAssists(signedIn: boolean) {
  const claim = useAssistRun('dream-rift', signedIn);
  return useCallback(
    async (coop: boolean): Promise<DreamRiftAssistFlags> => {
      if (!signedIn) return NO_ASSIST_FLAGS;
      try {
        if (coop) return dreamRiftCoopFlags((await api(getAssistsApi)).assists);
        return dreamRiftAssistFlags(await claim());
      } catch {
        return NO_ASSIST_FLAGS;
      }
    },
    [signedIn, claim],
  );
}
