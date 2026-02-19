import { create } from "zustand";

interface HouseAlwaysWinsState {
  debt: number;
  flags: Record<string, boolean>;
  currentAreaLabel: string;

  addDebt: (amount: number) => void;
  setFlag: (key: string, value: boolean) => void;
  getFlag: (key: string) => boolean;
  setAreaLabel: (label: string) => void;
  resetRun: () => void;
}

export const useHouseAlwaysWinsStore = create<HouseAlwaysWinsState>()(
  (set, get) => ({
    debt: 0,
    flags: {},
    currentAreaLabel: "Lobby",

    addDebt: (amount) => set((s) => ({ debt: s.debt + amount })),

    setFlag: (key, value) =>
      set((s) => ({ flags: { ...s.flags, [key]: value } })),

    getFlag: (key) => get().flags[key] ?? false,

    setAreaLabel: (label) => set({ currentAreaLabel: label }),

    resetRun: () => set({ debt: 0, flags: {}, currentAreaLabel: "Lobby" }),
  })
);
