import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Keybinds {
  lane1: string;
  lane2: string;
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

interface Modifiers {
  invisible: boolean;
  speed: number;
  suddenDeath: boolean;
  bombs: boolean;
  switching: boolean;
  difficulty: Difficulty;
}

interface GameState {
  health: number;
  maxHealth: number;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  multiplier: number;
  songId: string;
  status: 'MENU' | 'PLAYING' | 'FINISHED' | 'FAILED';
  userName: string;
  keybinds: Keybinds;
  
  // New State
  modifiers: Modifiers;
  isPaused: boolean;
  volume: number;
  sfxVolume: number;
  audioOffset: number;
  opponents: Record<string, { id: string, score: number, combo: number, health: number, name: string, isDead?: boolean }>;
  
  // Multiplayer flag
  isMultiplayer: boolean;

  // Loading & Sync
  isLoadingSong: boolean;
  loadingProgress: number;
  countdown: number;

  // Multiplayer results
  multiplayerResults: { id: string; name: string; score: number; combo: number; health: number; isFinished: boolean; difficulty: any }[] | null;

  setIsMultiplayer: (v: boolean) => void;
  setIsLoadingSong: (loading: boolean) => void;
  setLoadingProgress: (progress: number) => void;
  setCountdown: (count: number) => void;
  
  setHealth: (health: number) => void;
  setScore: (score: number, combo: number, multiplier?: number) => void;
  setCombo: (combo: number) => void;
  setAccuracy: (accuracy: number) => void;
  setMaxCombo: (maxCombo: number) => void;
  setSongId: (songId: string) => void;
  setStatus: (status: 'MENU' | 'PLAYING' | 'FINISHED' | 'FAILED') => void;
  setUserName: (name: string) => void;
  setKeybinds: (keybinds: Keybinds) => void;
  setModifiers: (modifiers: Modifiers) => void;
  setIsPaused: (isPaused: boolean) => void;
  setVolume: (volume: number) => void;
  setSfxVolume: (sfxVolume: number) => void;
  setAudioOffset: (offset: number) => void;
  setOpponent: (id: string, data: Partial<{ id: string, score: number, combo: number, health: number, name: string, isDead?: boolean }>) => void;
  removeOpponent: (id: string) => void;
  setMultiplayerResults: (results: { id: string; name: string; score: number; combo: number; health: number; isFinished: boolean; difficulty: any }[] | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      health: 100,
      maxHealth: 100,
      score: 0,
      combo: 0,
      maxCombo: 0,
      accuracy: 0,
      multiplier: 1,
      songId: '',
      
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
          switching: false,
          difficulty: 'normal' as Difficulty,
      },
      isPaused: false,
      volume: 100,
      sfxVolume: 80,
      audioOffset: 0, // Default 0ms offset
      opponents: {},
      isMultiplayer: false,
      isLoadingSong: false,
      loadingProgress: 0,
      countdown: 0,
      multiplayerResults: null,
      
      setIsLoadingSong: (isLoadingSong) => set({ isLoadingSong }),
      setLoadingProgress: (loadingProgress) => set({ loadingProgress }),
      setCountdown: (countdown) => set({ countdown }),

      setHealth: (health) => set({ health: Math.max(0, Math.min(100, health)) }),
      setScore: (score, combo, multiplier) => set({ score, combo, multiplier }),
      setCombo: (combo) => set({ combo }),
      setAccuracy: (accuracy) => set({ accuracy }),
      setMaxCombo: (maxCombo) => set({ maxCombo }),
      setSongId: (songId) => set({ songId }),
      setStatus: (status) => set({ status }),
      setUserName: (name) => set({ userName: name }),
      setKeybinds: (keybinds) => set({ keybinds }),
      setModifiers: (modifiers) => set({ modifiers }),
      setIsPaused: (isPaused) => set({ isPaused }),
      setVolume: (volume) => set({ volume }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume }),
      setAudioOffset: (offset) => set({ audioOffset: offset }),
      setOpponent: (id, data) => set((state) => ({
          opponents: {
              ...state.opponents,
              [id]: { ...(state.opponents[id] || { id, score: 0, combo: 0, health: 100, name: 'Unknown' }), ...data }
          }
      })),
      removeOpponent: (id) => set((state) => {
          const { [id]: _, ...rest } = state.opponents;
          return { opponents: rest };
      }),
      setMultiplayerResults: (results) => set({ multiplayerResults: results }),
      setIsMultiplayer: (isMultiplayer) => set({ isMultiplayer }),
      reset: () => set({ health: 100, score: 0, combo: 0, maxCombo: 0, accuracy: 0, multiplier: 1, songId: '', status: 'MENU', isPaused: false, opponents: {}, isMultiplayer: false, multiplayerResults: null }),
    }),
    {
      name: 'slice-it-storage',
      partialize: (state) => ({ userName: state.userName, keybinds: state.keybinds, volume: state.volume, sfxVolume: state.sfxVolume, audioOffset: state.audioOffset }), // Persist settings only (not modifiers or game state)
    }
  )
);
