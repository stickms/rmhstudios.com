import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AbilityId, QuestState, RoomId } from "@/lib/house-always-wins/types";

interface HouseAlwaysWinsState {
  // Progression
  debt: number;
  chips: number;
  keys: number;
  abilities: Record<AbilityId, boolean>;
  flags: Record<string, boolean>;

  // Checkpoint / save
  introSeen: boolean;
  checkpointRoom: RoomId;
  checkpointId: string; // door or save-point id to spawn at
  deaths: number;
  visitedRooms: Record<string, boolean>;

  // Mutators
  addDebt: (amount: number) => void;
  payDebt: (amount: number) => number; // returns amount actually paid
  addChips: (amount: number) => void;
  spendChips: (amount: number) => boolean;
  addKey: () => void;
  grantAbility: (id: AbilityId) => void;
  hasAbility: (id: AbilityId) => boolean;
  setFlag: (key: string, value: boolean) => void;
  getFlag: (key: string) => boolean;
  markVisited: (room: RoomId) => void;
  setIntroSeen: (v: boolean) => void;
  setCheckpoint: (room: RoomId, id: string) => void;
  registerDeath: () => void;
  getQuestState: () => QuestState;
  resetRun: () => void;
}

const initialAbilities = (): Record<AbilityId, boolean> => ({
  doubleJump: false,
  dash: false,
  wallGrip: false,
});

export const useHouseAlwaysWinsStore = create<HouseAlwaysWinsState>()(
  persist(
    (set, get) => ({
      debt: 0,
      chips: 0,
      keys: 0,
      abilities: initialAbilities(),
      flags: {},

      introSeen: false,
      checkpointRoom: "lobby",
      checkpointId: "spawn",
      deaths: 0,
      visitedRooms: {},

      addDebt: (amount) => set((s) => ({ debt: Math.max(0, s.debt + amount) })),

      payDebt: (amount) => {
        const s = get();
        const pay = Math.min(amount, s.chips, s.debt);
        if (pay <= 0) return 0;
        set({ chips: s.chips - pay, debt: s.debt - pay });
        return pay;
      },

      addChips: (amount) => set((s) => ({ chips: s.chips + amount })),

      spendChips: (amount) => {
        const s = get();
        if (s.chips < amount) return false;
        set({ chips: s.chips - amount });
        return true;
      },

      addKey: () => set((s) => ({ keys: s.keys + 1 })),

      grantAbility: (id) =>
        set((s) => ({ abilities: { ...s.abilities, [id]: true } })),

      hasAbility: (id) => get().abilities[id] ?? false,

      setFlag: (key, value) =>
        set((s) => ({ flags: { ...s.flags, [key]: value } })),

      getFlag: (key) => get().flags[key] ?? false,

      markVisited: (room) =>
        set((s) =>
          s.visitedRooms[room] ? {} : { visitedRooms: { ...s.visitedRooms, [room]: true } }
        ),

      setIntroSeen: (v) => set({ introSeen: v }),

      setCheckpoint: (room, id) => set({ checkpointRoom: room, checkpointId: id }),

      registerDeath: () => set((s) => ({ deaths: s.deaths + 1 })),

      getQuestState: () => {
        const s = get();
        return {
          flags: s.flags,
          abilities: s.abilities,
          keys: s.keys,
          chips: s.chips,
          debt: s.debt,
        };
      },

      resetRun: () =>
        set({
          debt: 0,
          chips: 0,
          keys: 0,
          abilities: initialAbilities(),
          flags: {},
          introSeen: false,
          checkpointRoom: "lobby",
          checkpointId: "spawn",
          deaths: 0,
          visitedRooms: {},
        }),
    }),
    {
      name: "haw-save-v2",
      version: 2,
    }
  )
);
