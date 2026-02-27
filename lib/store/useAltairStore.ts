import { create } from 'zustand';

interface AltairStore {
    // Game State
    hp: number;
    maxHp: number;
    xp: number;
    maxXp: number;
    level: number;
    evolutionId: string;
    entropy: number;
    isLevelUp: boolean;
    isPaused: boolean;
    
    // Actions
    setHp: (val: number) => void;
    damage: (amount: number) => void;
    heal: (amount: number) => void;
    addXp: (amount: number) => void;
    levelUp: () => void;
    selectEvolution: (id: string) => void;
    setPaused: (paused: boolean) => void;
    resetGame: () => void;
}

export const useAltairStore = create<AltairStore>((set, get) => ({
    hp: 100,
    maxHp: 100,
    xp: 0,
    maxXp: 100,
    level: 1,
    evolutionId: 'echo',
    entropy: 1,
    isLevelUp: false,
    isPaused: false,

    setHp: (val) => set({ hp: val }),
    damage: (amount) => set((state) => ({ hp: Math.max(0, state.hp - amount) })),
    heal: (amount) => set((state) => ({ hp: Math.min(state.maxHp, state.hp + amount) })),
    
    addXp: (amount) => set((state) => {
        const newXp = state.xp + amount;
        if (newXp >= state.maxXp) {
            return { xp: state.maxXp, isLevelUp: true, isPaused: true };
        }
        return { xp: newXp };
    }),
    
    levelUp: () => set((state) => ({ 
        level: state.level + 1, 
        xp: 0, 
        maxXp: Math.floor(state.maxXp * 1.5),
        isLevelUp: false,
        isPaused: false
    })),
    
    selectEvolution: (id) => {
        set({ evolutionId: id });
        get().levelUp();
    },
    
    setPaused: (paused) => set({ isPaused: paused }),
    
    resetGame: () => set({
        hp: 100,
        maxHp: 100,
        xp: 0,
        maxXp: 100,
        level: 1,
        evolutionId: 'echo',
        entropy: 1,
        isLevelUp: false,
        isPaused: false
    })
}));
