import { create } from 'zustand';

interface GameState {
  score: number;
  combo: number;
  accuracy: number;
  multiplier: number;
  status: 'MENU' | 'PLAYING' | 'FINISHED';
  userName: string;
  
  setScore: (score: number, combo: number, multiplier?: number) => void;
  setStatus: (status: 'MENU' | 'PLAYING' | 'FINISHED') => void;
  setUserName: (name: string) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  score: 0,
  combo: 0,
  accuracy: 0,
  multiplier: 1,
  status: 'MENU',
  userName: 'Player',
  
  setScore: (score, combo, multiplier = 1) => set({ score, combo, multiplier }),
  setStatus: (status) => set({ status }),
  setUserName: (name) => set({ userName: name }),
  reset: () => set({ score: 0, combo: 0, accuracy: 0, multiplier: 1, status: 'MENU', userName: 'Player' }),
}));
