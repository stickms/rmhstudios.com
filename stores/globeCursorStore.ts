import { create } from 'zustand';
import {
  DEFAULT_GLOBE_CURSOR,
  GLOBE_CURSOR_KEY,
  PRESET_PATCHES,
  randomGlobeCursor,
  sanitizeGlobeCursor,
  type GlobeCursorPreset,
  type GlobeCursorSettings,
} from '@/lib/globe-cursor/settings';

/**
 * The globe cursor's settings, per device (a pointer preference belongs to the
 * mouse it is used with, not to the account).
 *
 * Hydrated after mount, never during render, so SSR markup and the first client
 * render agree — the same pattern as `focusStore` / `themeStore`. `hydrate` also
 * listens for the `storage` event, so a change in one tab re-skins the cursor in
 * every other open tab.
 */

interface GlobeCursorState {
  settings: GlobeCursorSettings;
  hydrated: boolean;
  hydrate: () => void;
  update: (patch: Partial<GlobeCursorSettings>) => void;
  applyPreset: (preset: GlobeCursorPreset) => void;
  randomize: () => void;
  reset: () => void;
}

function read(): GlobeCursorSettings {
  try {
    const raw = localStorage.getItem(GLOBE_CURSOR_KEY);
    return sanitizeGlobeCursor(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_GLOBE_CURSOR };
  }
}

function write(settings: GlobeCursorSettings) {
  try {
    localStorage.setItem(GLOBE_CURSOR_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / quota: the setting still applies for this page view.
  }
}

export const useGlobeCursorStore = create<GlobeCursorState>((set, get) => {
  const commit = (next: GlobeCursorSettings) => {
    write(next);
    set({ settings: next });
  };
  return {
    settings: DEFAULT_GLOBE_CURSOR,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated || typeof window === 'undefined') return;
      set({ settings: read(), hydrated: true });
      window.addEventListener('storage', (e) => {
        if (e.key === GLOBE_CURSOR_KEY) set({ settings: read() });
      });
    },
    update: (patch) => commit(sanitizeGlobeCursor({ ...get().settings, ...patch })),
    applyPreset: (preset) =>
      commit(sanitizeGlobeCursor({ ...get().settings, ...PRESET_PATCHES[preset] })),
    randomize: () => commit(randomGlobeCursor(get().settings)),
    reset: () => commit({ ...DEFAULT_GLOBE_CURSOR }),
  };
});
