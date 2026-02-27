/**
 * Settings store for Altair — persisted to localStorage.
 * Manages theme, keybinds, and gameplay preferences.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Keybinds {
  up: string;
  down: string;
  left: string;
  right: string;
  pause: string;
}

const DEFAULT_KEYBINDS: Keybinds = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  pause: 'Escape',
};

interface AltairSettingsState {
  theme: 'dark' | 'light';
  keybinds: Keybinds;
  doubleTime: boolean;
  screenShake: boolean;

  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setKeybind: (action: keyof Keybinds, key: string) => void;
  resetKeybinds: () => void;
  setDoubleTime: (enabled: boolean) => void;
  setScreenShake: (enabled: boolean) => void;
}

export const useAltairSettingsStore = create<AltairSettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      keybinds: { ...DEFAULT_KEYBINDS },
      doubleTime: false,
      screenShake: true,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setKeybind: (action, key) =>
        set((s) => ({ keybinds: { ...s.keybinds, [action]: key } })),
      resetKeybinds: () => set({ keybinds: { ...DEFAULT_KEYBINDS } }),
      setDoubleTime: (enabled) => set({ doubleTime: enabled }),
      setScreenShake: (enabled) => set({ screenShake: enabled }),
    }),
    {
      name: 'altair-settings',
      partialize: (s) => ({
        theme: s.theme,
        keybinds: s.keybinds,
        doubleTime: s.doubleTime,
        screenShake: s.screenShake,
      }),
    }
  )
);
