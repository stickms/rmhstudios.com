import { create } from 'zustand'
import { persist } from 'zustand/middleware';
import { TowerType } from './Entities'

export const TOWER_COSTS: Record<TowerType, number> = {
  'SYNAPSE': 20,
  'SUPPRESSOR': 50,
  'LOBOTOMIZER': 150,
  'ECHO': 100
};

interface LogMessage {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface GameState {
  isRunning: boolean
  currentLoop: number
  sanity: number // 0-100
  focus: number // Money
  neuroplasticity: number
  waveTime: number // Difficulty Scaling
  selectedTower: TowerType | null
  selectedEntity: any | null
  
  // Progression
  level: number
  unlockedTowers: TowerType[]
  
  // UI State
  isPaused: boolean
  isTransitioning: boolean
  showTutorial: boolean
  logs: LogMessage[]
  
  // Actions
  setRunning: (running: boolean) => void
  setLoop: (loop: number) => void // Renamed from loop to Level in UI, but keep variable for now or rename? Plan says "level".
  setLevel: (level: number) => void
  setPaused: (paused: boolean) => void
  unlockTower: (tower: TowerType) => void
  
  modifySanity: (amount: number) => void
  modifyFocus: (amount: number) => void
  setWaveTime: (time: number) => void
  setSelectedTower: (tower: TowerType | null) => void
  setSelectedEntity: (entity: any | null) => void
  setTransitioning: (transitioning: boolean) => void
  setShowTutorial: (show: boolean) => void
  addLog: (text: string, type?: 'info' | 'warning' | 'error' | 'success') => void
  resetGame: () => void
}

export const TOWER_UNLOCK_ORDER: TowerType[] = ['SYNAPSE', 'SUPPRESSOR', 'LOBOTOMIZER', 'ECHO'];

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      isRunning: false,
      currentLoop: 1, // Determines Difficulty
      level: 1, // Determines Unlocks
      sanity: 100,
      focus: 100,
      neuroplasticity: 0,
      waveTime: 0,
      selectedTower: null,
      selectedEntity: null,
      
      unlockedTowers: ['SYNAPSE'],
      
      isPaused: false,
      isTransitioning: false,
      showTutorial: true,
      logs: [{ id: 'init', text: 'SYSTEM INITIALIZED...', type: 'info' }],

      setRunning: (running) => set({ isRunning: running }),
      setLoop: (loop) => set({ currentLoop: loop }),
      setLevel: (level) => set({ level }),
      setPaused: (paused) => set({ isPaused: paused }),
      unlockTower: (tower) => set((state) => ({ unlockedTowers: [...state.unlockedTowers, tower] })),
      
      modifySanity: (amount) => set((state) => ({ sanity: Math.max(0, Math.min(100, state.sanity + amount)) })),
      modifyFocus: (amount) => set((state) => ({ focus: Math.max(0, state.focus + amount) })),
      setWaveTime: (time) => set({ waveTime: time }),
      setSelectedTower: (tower) => set({ selectedTower: tower, selectedEntity: null }),
      setSelectedEntity: (entity) => set({ selectedEntity: entity, selectedTower: null }),
      setTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
      setShowTutorial: (show) => set({ showTutorial: show }),
      addLog: (text, type = 'info') => set((state) => ({ 
        logs: [{ id: Math.random().toString(), text, type }, ...state.logs].slice(0, 5) 
      })),
      
      resetGame: () => set({
        isRunning: false,
        currentLoop: 1,
        level: 1,
        sanity: 100,
        focus: 100,
        neuroplasticity: 0,
        waveTime: 0,
        selectedTower: null,
        selectedEntity: null,
        unlockedTowers: ['SYNAPSE'],
        isPaused: false,
        isTransitioning: false,
        showTutorial: true,
        logs: [{ id: 'reset', text: 'SYSTEM RESET...', type: 'info' }]
      })
    }),
    {
      name: 'vega-storage',
      partialize: (state) => ({ 
        level: state.level,
        unlockedTowers: state.unlockedTowers,
        focus: state.focus, 
        currentLoop: state.currentLoop, 
      }),
    }
  )
);
