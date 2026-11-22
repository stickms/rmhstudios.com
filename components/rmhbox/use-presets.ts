/**
 * Applying a preset to the lobby's settings. Applying only fills the form: the values go out
 * over the existing settings event, which the game coordinator validates and clamps like any
 * manual change. The host still confirms.
 */
import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { useSession } from '@/components/Providers';
import { C2S } from '@/lib/rmhbox/events';
import type { RmhboxPreset } from '@/lib/rmhbox/presets';
import { presetsQuery } from '@/lib/rmhbox/presets.queries';
import { emit } from '@/lib/rmhbox/socket';

interface PresetSelection {
  /** The preset shown in the select, per minigame (absent: game defaults). */
  selected: Record<string, string | undefined>;
  /** Minigames whose last applied preset no longer fit their schema. */
  notice: Record<string, boolean>;
  /** `lobbyId:minigameId` the default was last applied for, so a pick applies it once. */
  autoKey: string | null;
  set: (minigameId: string, id: string | undefined, notice: boolean) => void;
  markAuto: (key: string) => void;
}

export const usePresetSelection = create<PresetSelection>((set) => ({
  selected: {},
  notice: {},
  autoKey: null,
  set: (minigameId, id, notice) =>
    set((s) => ({
      selected: { ...s.selected, [minigameId]: id },
      notice: { ...s.notice, [minigameId]: notice },
    })),
  markAuto: (autoKey) => set({ autoKey }),
}));

/** Fill the form from a preset, or (no preset) back to the game's defaults. */
export function useApplyPreset(lobbyId: string, minigameId: string) {
  const setSelection = usePresetSelection((s) => s.set);
  return useCallback(
    (preset: RmhboxPreset | null) => {
      if (!lobbyId) return;
      if (preset) emit(C2S.GAME_UPDATE_SETTINGS, { lobbyId, settings: preset.values });
      else emit(C2S.GAME_RESET_SETTINGS, { lobbyId });
      setSelection(minigameId, preset?.id, preset?.reset ?? false);
    },
    [lobbyId, minigameId, setSelection],
  );
}

/**
 * Apply the host's default preset once when a minigame is picked. Mount it where the host is
 * present for the whole selection (not inside a modal that opens later).
 */
export function useAutoApplyDefaultPreset(lobbyId: string, minigameId: string | undefined, enabled: boolean) {
  const { data: session } = useSession();
  const apply = useApplyPreset(lobbyId, minigameId ?? '');
  const autoKey = usePresetSelection((s) => s.autoKey);
  const markAuto = usePresetSelection((s) => s.markAuto);
  const on = enabled && !!session && !!minigameId && !!lobbyId;
  const { data } = useQuery(presetsQuery(minigameId, on));
  const key = `${lobbyId}:${minigameId}`;

  useEffect(() => {
    if (!on || !data || autoKey === key) return;
    markAuto(key);
    const preset = data.presets.find((p) => p.isDefault);
    if (preset) apply(preset);
    // No default: the form opens on the game's defaults, so the select must say so too.
    else usePresetSelection.getState().set(minigameId ?? '', undefined, false);
  }, [on, data, autoKey, key, markAuto, apply, minigameId]);
}
