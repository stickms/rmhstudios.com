import { create } from 'zustand';

/**
 * X4 - "Answer" on the question-of-the-day card tags the composer. The card and
 * the composer are separate lazy chunks that never import each other, so this
 * tiny store is the only thing they share.
 */
export interface QotdAnswering {
  dayKey: string;
  text: string;
}

interface QotdAnsweringState {
  answering: QotdAnswering | null;
  start: (a: QotdAnswering) => void;
  clear: () => void;
}

export const useQotdAnswering = create<QotdAnsweringState>((set) => ({
  answering: null,
  start: (answering) => set({ answering }),
  clear: () => set({ answering: null }),
}));
