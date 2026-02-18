import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GameState } from '@/lib/echoes/types';

interface EchoesStore extends GameState {
    setMemories: (amount: number) => void;
    addMemories: (amount: number) => void;
    spendMemories: (amount: number) => boolean;
    setEntropy: (amount: number) => void;
    increaseEntropy: (amount: number) => void;
    decreaseEntropy: (amount: number) => void;
    unlockNode: (nodeId: string) => void;
    setCurrentTimeline: (nodeId: string) => void;
    setGameOver: (isOver: boolean) => void;
    startGame: () => void;
    resetGame: () => void;
}

export const useEchoesStore = create<EchoesStore>()(
    persist(
        (set, get) => ({
            memories: 0,
            entropy: 0,
            unlockedNodes: ['root'],
            currentTimeline: 'root',
            isGameOver: false,
            gameStarted: false,

            setMemories: (amount) => set({ memories: amount }),
            addMemories: (amount) => set((state) => ({ memories: state.memories + amount })),
            spendMemories: (amount) => {
                const { memories } = get();
                if (memories >= amount) {
                    set({ memories: memories - amount });
                    return true;
                }
                return false;
            },

            setEntropy: (amount) => set({ entropy: Math.min(100, Math.max(0, amount)) }),
            increaseEntropy: (amount) => {
                const { entropy, isGameOver } = get();
                if (isGameOver) return;
                
                const newEntropy = Math.min(100, entropy + amount);
                set({ entropy: newEntropy });
                
                if (newEntropy >= 100) {
                    set({ isGameOver: true });
                }
            },
            decreaseEntropy: (amount) => set((state) => ({ entropy: Math.max(0, state.entropy - amount) })),

            unlockNode: (nodeId) => set((state) => {
                if (!state.unlockedNodes.includes(nodeId)) {
                    return { unlockedNodes: [...state.unlockedNodes, nodeId] };
                }
                return {};
            }),

            setCurrentTimeline: (nodeId) => set({ currentTimeline: nodeId }),
            setGameOver: (isOver) => set({ isGameOver: isOver }),
            
            startGame: () => set({ gameStarted: true, isGameOver: false, entropy: 0, memories: 50, currentTimeline: 'root' }), // Start with some memories
            resetGame: () => set({ 
                memories: 0, 
                entropy: 0, 
                unlockedNodes: ['root'], 
                currentTimeline: 'root', 
                isGameOver: false,
                gameStarted: false
            })
        }),
        {
            name: 'echoes-storage',
            partialize: (state) => ({
                memories: state.memories,
                entropy: state.entropy,
                unlockedNodes: state.unlockedNodes,
                currentTimeline: state.currentTimeline,
                isGameOver: state.isGameOver,
                gameStarted: state.gameStarted
            })
        }
    )
);
