/**
 * The viewer's subtitle choice (sprint 11 16): the last label they chose (null is Off, the default) and the size. Kept
 * on this device only, under `rmh:rmhtube:subtitles`; never sent anywhere. Reads and writes never throw.
 */
import { create } from 'zustand';
import { persisted } from '@/lib/core/persist';
import {
  DEFAULT_SUBTITLE_PREFS,
  SUBTITLE_PREFS_KEY,
  coerceSubtitlePrefs,
  type SubtitlePrefs,
  type SubtitleSize,
} from './subtitles';

const storage = persisted<SubtitlePrefs>({
  key: SUBTITLE_PREFS_KEY,
  version: 1,
  fallback: DEFAULT_SUBTITLE_PREFS,
  validate: (value) => coerceSubtitlePrefs(value),
});

interface SubtitlePrefsState extends SubtitlePrefs {
  setLabel: (label: string | null) => void;
  setSize: (size: SubtitleSize) => void;
}

export const useSubtitlePrefs = create<SubtitlePrefsState>((set, get) => ({
  ...storage.read(),
  setLabel: (label) => {
    set({ label });
    storage.write({ label, size: get().size });
  },
  setSize: (size) => {
    set({ size });
    storage.write({ label: get().label, size });
  },
}));

/** The track of an item the viewer's chosen label names (case-insensitive), or null for Off or no match. */
export function pickTrack<T extends { label: string }>(
  tracks: readonly T[] | undefined,
  label: string | null,
): T | null {
  if (!label || !tracks) return null;
  const want = label.toLowerCase();
  return tracks.find((t) => t.label.toLowerCase() === want) ?? null;
}

/** A position (ms) the player's tick publishes; the overlay reads the cue for it. No timer or frame loop of its own. */
export interface PositionBus {
  set: (ms: number) => void;
  get: () => number;
  subscribe: (listener: () => void) => () => void;
}

export function createPositionBus(): PositionBus {
  let value = -1;
  const listeners = new Set<() => void>();
  return {
    set(ms) {
      if (ms === value) return;
      value = ms;
      for (const l of listeners) l();
    },
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
