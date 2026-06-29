import { create } from 'zustand';

interface DeskState {
  focusedMode: string | null;
  setFocusedMode: (id: string | null) => void;
}

/** Which puzzle the desk camera is leaning into. null = front page. */
export const useDeskStore = create<DeskState>((set) => ({
  focusedMode: null,
  setFocusedMode: (id) => set({ focusedMode: id }),
}));
