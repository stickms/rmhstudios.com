/**
 * Settings store for Altair — persisted to localStorage.
 * Manages keybinds and gameplay preferences. (There is no theme setting: Altair has one look.)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clampHeat } from '@/lib/altair/data/heat';

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
  keybinds: Keybinds;
  doubleTime: boolean;
  /** The Heat tier chosen for the next run (clamped to what the account has unlocked when the run starts). */
  heat: number;
  screenShake: boolean;
  joystickSide: 'left' | 'right';
  zoomTiles: number;   // tiles visible in each direction from center (4–20)
  masterVolume: number; // 0–1
  musicVolume: number;  // 0–1
  sfxVolume: number;    // 0–1

  setKeybind: (action: keyof Keybinds, key: string) => void;
  resetKeybinds: () => void;
  setDoubleTime: (enabled: boolean) => void;
  setHeat: (heat: number) => void;
  setScreenShake: (enabled: boolean) => void;
  setJoystickSide: (side: 'left' | 'right') => void;
  setZoomTiles: (v: number) => void;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
}

export const useAltairSettingsStore = create<AltairSettingsState>()(
  persist(
    (set) => ({
      keybinds: { ...DEFAULT_KEYBINDS },
      doubleTime: false,
      heat: 0,
      screenShake: true,
      joystickSide: 'left',
      zoomTiles: 8,
      masterVolume: 0.7,
      musicVolume: 0.5,
      sfxVolume: 0.7,

      setKeybind: (action, key) =>
        set((s) => ({ keybinds: { ...s.keybinds, [action]: key } })),
      resetKeybinds: () => set({ keybinds: { ...DEFAULT_KEYBINDS } }),
      setDoubleTime: (enabled) => set({ doubleTime: enabled }),
      setHeat: (heat) => set({ heat: clampHeat(heat) }),
      setScreenShake: (enabled) => set({ screenShake: enabled }),
      setJoystickSide: (side) => set({ joystickSide: side }),
      setZoomTiles: (v) => set({ zoomTiles: Math.max(4, Math.min(20, Math.round(v))) }),
      setMasterVolume: (v) => set({ masterVolume: v }),
      setMusicVolume: (v) => set({ musicVolume: v }),
      setSfxVolume: (v) => set({ sfxVolume: v }),
    }),
    {
      name: 'altair-settings',
      partialize: (s) => ({
        keybinds: s.keybinds,
        doubleTime: s.doubleTime,
        heat: s.heat,
        screenShake: s.screenShake,
        joystickSide: s.joystickSide,
        zoomTiles: s.zoomTiles,
        masterVolume: s.masterVolume,
        musicVolume: s.musicVolume,
        sfxVolume: s.sfxVolume,
      }),
    }
  )
);
