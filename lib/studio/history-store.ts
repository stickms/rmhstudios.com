import { create } from 'zustand';

/**
 * Undo/redo history using a snapshot-based approach.
 * Stores serialized state snapshots (tracks + clips + patterns).
 */

interface StateSnapshot {
  tracks: string; // JSON serialized
  clips: string;
  patterns: string;
  label: string;
}

interface HistoryStore {
  undoStack: StateSnapshot[];
  redoStack: StateSnapshot[];
  maxSize: number;

  push: (snapshot: StateSnapshot) => void;
  undo: () => StateSnapshot | null;
  redo: () => StateSnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxSize: 50,

  push: (snapshot) =>
    set((s) => {
      const stack = [...s.undoStack, snapshot];
      if (stack.length > s.maxSize) stack.shift();
      return { undoStack: stack, redoStack: [] };
    }),

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const snapshot = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, snapshot],
    });
    return undoStack.length >= 2 ? undoStack[undoStack.length - 2] : null;
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const snapshot = redoStack[redoStack.length - 1];
    set({
      undoStack: [...undoStack, snapshot],
      redoStack: redoStack.slice(0, -1),
    });
    return snapshot;
  },

  canUndo: () => get().undoStack.length > 1,
  canRedo: () => get().redoStack.length > 0,
  clear: () => set({ undoStack: [], redoStack: [] }),
}));
