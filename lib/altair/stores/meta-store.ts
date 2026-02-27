/**
 * Meta-progression store for Altair — persisted to localStorage.
 * Manages persistent coins, purchased upgrades, unlocked classes, and achievements.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { META_UPGRADES } from '@/lib/altair/data/meta-upgrades';

interface AltairMetaState {
  coins: number;
  upgrades: Record<string, number>; // upgradeId → purchased level
  unlockedClasses: string[];
  doubleTimeUnlocked: boolean;
  classFirstClears: string[]; // classIds that have had a first 20:00 clear
  totalRunsPlayed: number;

  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  purchaseUpgrade: (id: string) => boolean;
  unlockClass: (id: string) => void;
  unlockDoubleTime: () => void;
  recordFirstClear: (classId: string) => number; // returns bonus coins
  incrementRuns: () => void;
  getUpgradeLevel: (id: string) => number;
  getMetaStatBonuses: () => Record<string, number>;
}

export const useAltairMetaStore = create<AltairMetaState>()(
  persist(
    (set, get) => ({
      coins: 0,
      upgrades: {},
      unlockedClasses: ['knight', 'arcanist', 'ranger'],
      doubleTimeUnlocked: false,
      classFirstClears: [],
      totalRunsPlayed: 0,

      addCoins: (amount) => set((s) => ({ coins: s.coins + amount })),

      spendCoins: (amount) => {
        const s = get();
        if (s.coins < amount) return false;
        set({ coins: s.coins - amount });
        return true;
      },

      purchaseUpgrade: (id) => {
        const s = get();
        const currentLevel = s.upgrades[id] || 0;
        const def = META_UPGRADES.find((u) => u.id === id);
        if (!def || currentLevel >= def.maxLevel) return false;
        const cost = def.costs[currentLevel];
        if (s.coins < cost) return false;
        set({
          coins: s.coins - cost,
          upgrades: { ...s.upgrades, [id]: currentLevel + 1 },
        });
        return true;
      },

      unlockClass: (id) =>
        set((s) => ({
          unlockedClasses: s.unlockedClasses.includes(id)
            ? s.unlockedClasses
            : [...s.unlockedClasses, id],
        })),

      unlockDoubleTime: () => set({ doubleTimeUnlocked: true }),

      recordFirstClear: (classId) => {
        const s = get();
        if (s.classFirstClears.includes(classId)) return 0;
        set({ classFirstClears: [...s.classFirstClears, classId] });
        return 200; // bonus coins for first clear
      },

      incrementRuns: () => set((s) => ({ totalRunsPlayed: s.totalRunsPlayed + 1 })),

      getUpgradeLevel: (id) => get().upgrades[id] || 0,

      getMetaStatBonuses: () => {
        const s = get();
        const bonuses: Record<string, number> = {};
        for (const def of META_UPGRADES) {
          const level = s.upgrades[def.id] || 0;
          if (level > 0) {
            for (const [stat, perLevel] of Object.entries(def.effectPerLevel)) {
              bonuses[stat] = (bonuses[stat] || 0) + perLevel * level;
            }
          }
        }
        return bonuses;
      },
    }),
    {
      name: 'altair-meta',
      partialize: (s) => ({
        coins: s.coins,
        upgrades: s.upgrades,
        unlockedClasses: s.unlockedClasses,
        doubleTimeUnlocked: s.doubleTimeUnlocked,
        classFirstClears: s.classFirstClears,
        totalRunsPlayed: s.totalRunsPlayed,
      }),
    }
  )
);
