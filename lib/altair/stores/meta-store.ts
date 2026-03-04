/**
 * Meta-progression store for Altair — persisted to localStorage + synced to DB.
 * Manages persistent coins, purchased upgrades, unlocked classes, and achievements.
 *
 * On page load, loadFromServer() merges DB state with localStorage (DB wins for
 * coins / upgrades / unlocks so progress isn't lost across devices).
 * After every mutation that changes persistent data, saveToServer() fires
 * (debounced) to push the latest state to the API.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { META_UPGRADES } from '@/lib/altair/data/meta-upgrades';

// ---- DB sync helpers (fire-and-forget, debounced) ---------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function getPersistedState() {
  const s = useAltairMetaStore.getState();
  return {
    coins: s.coins,
    upgrades: s.upgrades,
    unlockedClasses: s.unlockedClasses,
    doubleTimeUnlocked: s.doubleTimeUnlocked,
    classFirstClears: s.classFirstClears,
    totalRunsPlayed: s.totalRunsPlayed,
    bestTimeSurvived: s.bestTimeSurvived,
    bestKills: s.bestKills,
    bossesDefeated: s.bossesDefeated,
    bestiary: s.bestiary,
  };
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fetch('/api/altair/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getPersistedState()),
    }).catch(() => { /* silently ignore — localStorage is the fallback */ });
  }, 1000);
}

// ---- Store ------------------------------------------------------------------

interface AltairMetaState {
  coins: number;
  upgrades: Record<string, number>; // upgradeId → purchased level
  unlockedClasses: string[];
  doubleTimeUnlocked: boolean;
  classFirstClears: string[]; // classIds that have had a first 20:00 clear
  totalRunsPlayed: number;
  // Persistent best-run stats for retroactive unlock checks
  bestTimeSurvived: number;
  bestKills: number;
  bossesDefeated: string[];
  bestiary: Record<string, { encountered: number; killed: number; killedBy: number }>;
  _loadedFromServer: boolean;

  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  purchaseUpgrade: (id: string) => boolean;
  purchaseClassUnlock: (classId: string, cost: number) => boolean;
  unlockClass: (id: string) => void;
  unlockDoubleTime: () => void;
  recordFirstClear: (classId: string) => number; // returns bonus coins
  incrementRuns: () => void;
  updateRunStats: (timeSurvived: number, kills: number, bossesDefeated: string[]) => void;
  checkUnlocks: () => void;
  getUpgradeLevel: (id: string) => number;
  getMetaStatBonuses: () => Record<string, number>;
  recordBestiaryEncounter: (defId: string) => void;
  recordBestiaryKill: (defId: string) => void;
  recordBestiaryKilledBy: (defId: string) => void;
  loadFromServer: () => Promise<void>;
  saveToServer: () => void;
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
      bestTimeSurvived: 0,
      bestKills: 0,
      bossesDefeated: [],
      bestiary: {},
      _loadedFromServer: false,

      addCoins: (amount) => {
        set((s) => ({ coins: s.coins + amount }));
        scheduleSave();
      },

      spendCoins: (amount) => {
        const s = get();
        if (s.coins < amount) return false;
        set({ coins: s.coins - amount });
        scheduleSave();
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
        scheduleSave();
        return true;
      },

      purchaseClassUnlock: (classId, cost) => {
        const s = get();
        if (s.unlockedClasses.includes(classId)) return false;
        if (s.coins < cost) return false;
        set({
          coins: s.coins - cost,
          unlockedClasses: [...s.unlockedClasses, classId],
        });
        scheduleSave();
        return true;
      },

      unlockClass: (id) => {
        set((s) => ({
          unlockedClasses: s.unlockedClasses.includes(id)
            ? s.unlockedClasses
            : [...s.unlockedClasses, id],
        }));
        scheduleSave();
      },

      unlockDoubleTime: () => {
        set({ doubleTimeUnlocked: true });
        scheduleSave();
      },

      recordFirstClear: (classId) => {
        const s = get();
        if (s.classFirstClears.includes(classId)) return 0;
        set({ classFirstClears: [...s.classFirstClears, classId] });
        scheduleSave();
        return 200; // bonus coins for first clear
      },

      incrementRuns: () => {
        set((s) => ({ totalRunsPlayed: s.totalRunsPlayed + 1 }));
        scheduleSave();
      },

      updateRunStats: (timeSurvived, kills, bossesDefeated) => {
        const s = get();
        const newBosses = [...s.bossesDefeated];
        for (const b of bossesDefeated) {
          if (!newBosses.includes(b)) newBosses.push(b);
        }
        set({
          bestTimeSurvived: Math.max(s.bestTimeSurvived, timeSurvived),
          bestKills: Math.max(s.bestKills, kills),
          bossesDefeated: newBosses,
        });
        scheduleSave();
      },

      checkUnlocks: () => {
        const s = get();
        // Plague Doctor: survive 10 minutes (600s)
        if (s.bestTimeSurvived >= 600 && !s.unlockedClasses.includes('plague_doctor')) {
          get().unlockClass('plague_doctor');
        }
        // Berserker: kill 3,000 enemies in one run
        if (s.bestKills >= 3000 && !s.unlockedClasses.includes('berserker')) {
          get().unlockClass('berserker');
        }
        // Chronomancer: defeat the 15-minute boss (Elder Lich Malachar)
        if (s.bossesDefeated.includes('elder_lich_malachar') && !s.unlockedClasses.includes('chronomancer')) {
          get().unlockClass('chronomancer');
        }
        // Hemomancer: complete a full 20:00 run (victory)
        if (s.bestTimeSurvived >= 1200 && !s.unlockedClasses.includes('hemomancer')) {
          get().unlockClass('hemomancer');
        }
      },

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

      recordBestiaryEncounter: (defId) => {
        set((s) => {
          const entry = s.bestiary[defId] || { encountered: 0, killed: 0, killedBy: 0 };
          return { bestiary: { ...s.bestiary, [defId]: { ...entry, encountered: entry.encountered + 1 } } };
        });
        scheduleSave();
      },

      recordBestiaryKill: (defId) => {
        set((s) => {
          const entry = s.bestiary[defId] || { encountered: 0, killed: 0, killedBy: 0 };
          return { bestiary: { ...s.bestiary, [defId]: { ...entry, encountered: Math.max(entry.encountered, 1), killed: entry.killed + 1 } } };
        });
        scheduleSave();
      },

      recordBestiaryKilledBy: (defId) => {
        set((s) => {
          const entry = s.bestiary[defId] || { encountered: 0, killed: 0, killedBy: 0 };
          return { bestiary: { ...s.bestiary, [defId]: { ...entry, encountered: Math.max(entry.encountered, 1), killedBy: entry.killedBy + 1 } } };
        });
        scheduleSave();
      },

      loadFromServer: async () => {
        try {
          const res = await fetch('/api/altair/meta');
          if (!res.ok) return; // not logged in or server error — use localStorage
          const { data } = await res.json();
          if (!data) return; // no server data yet — first time

          const local = get();

          // Merge: take the max/superset so no progress is lost
          const mergedUpgrades: Record<string, number> = { ...local.upgrades };
          for (const [key, val] of Object.entries(data.upgrades as Record<string, number>)) {
            mergedUpgrades[key] = Math.max(mergedUpgrades[key] || 0, val);
          }

          const mergedClasses = Array.from(new Set([
            ...local.unlockedClasses,
            ...(data.unlockedClasses as string[]),
          ]));

          const mergedFirstClears = Array.from(new Set([
            ...local.classFirstClears,
            ...(data.classFirstClears as string[]),
          ]));

          const mergedBosses = Array.from(new Set([
            ...local.bossesDefeated,
            ...(data.bossesDefeated as string[]),
          ]));

          // Merge bestiary: take max of each stat per enemy
          const mergedBestiary: Record<string, { encountered: number; killed: number; killedBy: number }> = { ...local.bestiary };
          const serverBestiary = (data.bestiary || {}) as Record<string, { encountered: number; killed: number; killedBy: number }>;
          for (const [key, val] of Object.entries(serverBestiary)) {
            const localEntry = mergedBestiary[key] || { encountered: 0, killed: 0, killedBy: 0 };
            mergedBestiary[key] = {
              encountered: Math.max(localEntry.encountered, val.encountered || 0),
              killed: Math.max(localEntry.killed, val.killed || 0),
              killedBy: Math.max(localEntry.killedBy, val.killedBy || 0),
            };
          }

          set({
            coins: Math.max(local.coins, data.coins as number),
            upgrades: mergedUpgrades,
            unlockedClasses: mergedClasses,
            doubleTimeUnlocked: local.doubleTimeUnlocked || (data.doubleTimeUnlocked as boolean),
            classFirstClears: mergedFirstClears,
            totalRunsPlayed: Math.max(local.totalRunsPlayed, data.totalRunsPlayed as number),
            bestTimeSurvived: Math.max(local.bestTimeSurvived, data.bestTimeSurvived as number),
            bestKills: Math.max(local.bestKills, data.bestKills as number),
            bossesDefeated: mergedBosses,
            bestiary: mergedBestiary,
            _loadedFromServer: true,
          });

          // Push merged state back to server so both sides agree
          scheduleSave();
        } catch {
          // Offline or error — localStorage is the fallback
        }
      },

      saveToServer: () => scheduleSave(),
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
        bestTimeSurvived: s.bestTimeSurvived,
        bestKills: s.bestKills,
        bossesDefeated: s.bossesDefeated,
        bestiary: s.bestiary,
      }),
    }
  )
);
