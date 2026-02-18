import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DialogueNode {
    id: string;
    speaker: string;
    text: string;
    choices?: { text: string; nextId: string; effect?: () => void }[];
    requirements?: (flags: Record<string, boolean>) => boolean;
}

export type ItemType = 'key' | 'document' | 'consumable';

export interface Item {
    id: string;
    name: string;
    description: string;
    type: ItemType;
    image?: string; // URL or asset path
}

interface NarrativeState {
    // Quest Flags
    flags: Record<string, boolean>;
    setFlag: (key: string, value: boolean) => void;
    checkFlag: (key: string) => boolean;

    // Inventory
    inventory: Item[];
    addItem: (item: Item) => void;
    removeItem: (itemId: string) => void;
    hasItem: (itemId: string) => boolean;

    // Dialogue
    currentDialogueId: string | null;
    dialogueHistory: string[]; // IDs of read dialogue
    startDialogue: (id: string) => void;
    endDialogue: () => void;
    
    // Journal / Logs
    logs: string[];
    addLog: (logId: string) => void;
}

export const useNarrativeStore = create<NarrativeState>()(
    persist(
        (set, get) => ({
            flags: {},
            setFlag: (key, value) => set((state) => ({ flags: { ...state.flags, [key]: value } })),
            checkFlag: (key) => get().flags[key] || false,

            inventory: [],
            addItem: (item) => set((state) => ({ inventory: [...state.inventory, item] })),
            removeItem: (itemId) => set((state) => ({ inventory: state.inventory.filter(i => i.id !== itemId) })),
            hasItem: (itemId) => get().inventory.some(i => i.id === itemId),

            currentDialogueId: null,
            dialogueHistory: [],
            startDialogue: (id) => set({ currentDialogueId: id }),
            endDialogue: () => {
                const { currentDialogueId, dialogueHistory } = get();
                if (currentDialogueId) {
                    set({ 
                        currentDialogueId: null,
                        dialogueHistory: [...dialogueHistory, currentDialogueId]
                    });
                }
            },
            
            logs: [],
            addLog: (logId) => set((state) => ({ logs: [...state.logs, logId] }))
        }),
        {
            name: 'echoes-narrative-storage',
            partialize: (state) => ({
                flags: state.flags,
                inventory: state.inventory,
                dialogueHistory: state.dialogueHistory,
                logs: state.logs
            })
        }
    )
);
