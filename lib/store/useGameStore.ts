import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Keybinds {
  lane1: string;
  lane2: string;
}

interface Modifiers {
  invisible: boolean;
  speed: number;
  suddenDeath: boolean;
  bombs: boolean;
  switching: boolean;
}

interface GameState {
  health: number;
  maxHealth: number;
  score: number;
  combo: number;
  accuracy: number;
  multiplier: number;
  status: 'MENU' | 'PLAYING' | 'FINISHED' | 'FAILED';
  userName: string;
  keybinds: Keybinds;
  
  // New State
  modifiers: Modifiers;
  isPaused: boolean;
  volume: number;
  sfxVolume: number;
  
  setHealth: (health: number) => void;
  setScore: (score: number, combo: number, multiplier?: number) => void;
  setStatus: (status: 'MENU' | 'PLAYING' | 'FINISHED' | 'FAILED') => void;
  setUserName: (name: string) => void;
  setKeybinds: (keybinds: Keybinds) => void;
  setModifiers: (modifiers: Modifiers) => void;
  setIsPaused: (isPaused: boolean) => void;
  setVolume: (volume: number) => void;
  setSfxVolume: (sfxVolume: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      health: 100,
      maxHealth: 100,
      score: 0,
      combo: 0,
      accuracy: 0,
      multiplier: 1,
      
      status: 'MENU',
      userName: '', // Start empty to trigger prompt
      keybinds: {
        lane1: 'ArrowLeft',
        lane2: 'ArrowRight'
      },
      
      modifiers: {
          invisible: false,
          speed: 1.0,
          suddenDeath: false,
          bombs: false,
          switching: false
      },
      isPaused: false,
      volume: 100,
      sfxVolume: 80,
      
      setHealth: (health) => set({ health }),
      setScore: (score, combo, multiplier) => set({ score, combo, multiplier }),
      setStatus: (status) => set({ status }),
      setUserName: (name) => set({ userName: name }),
      setKeybinds: (keybinds) => set({ keybinds }),
      setModifiers: (modifiers) => set({ modifiers }),
      setIsPaused: (isPaused) => set({ isPaused }),
      setVolume: (volume) => set({ volume }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume }),
      reset: () => set({ health: 100, score: 0, combo: 0, accuracy: 0, multiplier: 1, status: 'MENU', isPaused: false }),
    }),
    {
      name: 'slice-it-storage',
      partialize: (state) => ({ userName: state.userName, keybinds: state.keybinds, volume: state.volume, sfxVolume: state.sfxVolume }), // Persist settings only (not modifiers or game state)
    }
  )
);
