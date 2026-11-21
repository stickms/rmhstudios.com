/** A member's RMHBox presets, cached for the session and dropped by `invalidateQueries({ queryKey: PRESETS_KEY })`. */
import { listRmhboxPresetsApi } from '@/lib/rmhbox/presets.contract';
import { contractQuery } from '@/lib/route/route-query';

export const PRESETS_KEY = ['rmhbox', 'presets'] as const;

/** One minigame's presets, or every preset when `minigameId` is omitted (the manage view). */
export const presetsQuery = (minigameId?: string, enabled = true) =>
  contractQuery(
    [...PRESETS_KEY, minigameId ?? 'all'],
    listRmhboxPresetsApi,
    { query: minigameId ? { minigame: minigameId } : {} },
    { staleTime: Infinity, enabled },
  );
