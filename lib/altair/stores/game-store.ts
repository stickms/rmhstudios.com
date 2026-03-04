/**
 * Game store for Altair — per-run state (NOT persisted).
 * Manages the active game session: HP, XP, level, weapons, passives, phase, etc.
 */
import { create } from 'zustand';

export interface PlayerStats {
  maxHp: number;
  hpRegen: number; // HP per second
  moveSpeed: number; // px/s
  might: number; // damage multiplier
  attackSpeed: number; // cooldown multiplier (lower = faster)
  area: number; // hitbox size multiplier
  projCount: number; // additive bonus projectiles
  projSpeed: number; // projectile speed multiplier
  duration: number; // effect duration multiplier
  pickupRange: number; // px
  luck: number; // drop rate / crit multiplier
  armor: number; // flat damage reduction
  cdr: number; // cooldown reduction multiplier (lower = faster)
  revival: number; // number of revives
  growth: number; // XP value multiplier
  pierce: number; // NEW v1.1: projectile pass-through targets
}

export const GLOBAL_BASE_STATS: PlayerStats = {
  maxHp: 100,
  hpRegen: 0,
  moveSpeed: 200,
  might: 1.0,
  attackSpeed: 1.0,
  area: 1.0,
  projCount: 0,
  projSpeed: 1.0,
  duration: 1.0,
  pickupRange: 50,
  luck: 1.0,
  armor: 0,
  cdr: 1.0,
  revival: 0,
  growth: 1.0,
  pierce: 0,
};

// Stat caps from GDD Section 2
export const STAT_SOFT_CAPS: Partial<Record<keyof PlayerStats, number>> = {
  moveSpeed: 350,
  might: 3.0,
  attackSpeed: 2.5,
  area: 3.0,
  projCount: 5,
  armor: 10,
  cdr: 0.5,
  growth: 3.0,
  pierce: 5,
};

export const STAT_HARD_CAPS: Partial<Record<keyof PlayerStats, number>> = {
  moveSpeed: 500,
  might: 5.0,
  attackSpeed: 4.0,
  area: 5.0,
  projCount: 8,
  armor: 20,
  cdr: 0.25,
  revival: 3,
  growth: 5.0,
  pierce: 10,
};

export interface WeaponSlot {
  weaponId: string;
  level: number;
  evolved: boolean;
}

export interface PassiveSlot {
  passiveId: string;
  level: number;
}

export interface CatalystSlot {
  catalystId: string;
  level: number;
}

export type UpgradeChoice =
  | { type: 'new_weapon'; weaponId: string }
  | { type: 'upgrade_weapon'; weaponId: string; newLevel: number }
  | { type: 'new_passive'; passiveId: string }
  | { type: 'upgrade_passive'; passiveId: string; newLevel: number }
  | { type: 'new_catalyst'; catalystId: string }
  | { type: 'upgrade_catalyst'; catalystId: string; newLevel: number }
  | { type: 'gold'; amount: number };

export type GamePhase =
  | 'menu'
  | 'class_select'
  | 'playing'
  | 'upgrading'
  | 'paused'
  | 'dead'
  | 'victory'
  | 'meta_shop';

/** XP required to go from `level` to `level+1` — v1.1 — steeper cubic XP curve */
export function xpRequired(level: number): number {
  return Math.floor(8 + level * 4 + level * level * 0.6 + level * level * level * 0.008);
}

interface CoinBreakdown {
  enemyDrops: number;
  bossKills: number;
  chestDrops: number;
  survivalBonus: number;
  killMilestones: number;
  completionBonus: number;
  firstClearBonus: number;
}

interface GameState {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  kills: number;
  totalKills: number; // for milestone tracking
  coins: number; // run coins
  coinBreakdown: CoinBreakdown;
  timeSurvived: number; // seconds
  weapons: WeaponSlot[];
  passives: PassiveSlot[];
  catalysts: CatalystSlot[];
  selectedClassId: string | null;
  effectiveStats: PlayerStats;
  upgradeChoices: UpgradeChoice[];
  rerollsRemaining: number;
  banishesRemaining: number;
  banishedIds: Set<string>;
  revivalsRemaining: number;
  bossActive: boolean;
  bossesDefeatedThisRun: string[];
  doubleTime: boolean;
  killMilestonesHit: number[]; // which milestones already awarded
  previousPhase: GamePhase; // for unpausing

  // Actions
  setPhase: (phase: GamePhase) => void;
  goToMenu: () => void;
  goToClassSelect: () => void;
  startRun: (classId: string, doubleTime: boolean, metaBonuses: Record<string, number>, metaRerolls: number, metaBanishes: number, metaRevival: number, extraChoice: boolean) => void;
  takeDamage: (amount: number) => void;
  heal: (amount: number) => void;
  addXP: (amount: number) => void;
  addKill: (defId?: string) => void;
  addCoins: (amount: number, source: keyof CoinBreakdown) => void;
  tick: (delta: number) => void;
  setUpgradeChoices: (choices: UpgradeChoice[]) => void;
  pickUpgrade: (index: number) => void;
  reroll: (newChoices: UpgradeChoice[]) => void;
  banish: (index: number) => void;
  addWeapon: (weaponId: string) => void;
  upgradeWeapon: (weaponId: string) => void;
  evolveWeapon: (weaponId: string, evolvedId: string, consumedCatalystId?: string) => void;
  addPassive: (passiveId: string) => void;
  upgradePassive: (passiveId: string) => void;
  addCatalyst: (catalystId: string) => void;
  upgradeCatalyst: (catalystId: string) => void;
  consumeCatalyst: (catalystId: string) => void;
  setEffectiveStats: (stats: PlayerStats) => void;
  setBossActive: (active: boolean) => void;
  recordBossKill: (bossId: string) => void;
  togglePause: () => void;
  revive: () => void;
  die: () => void;
  victory: () => void;
  checkKillMilestones: () => void;
}

export const useAltairGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  hp: 100,
  maxHp: 100,
  xp: 0,
  level: 1,
  kills: 0,
  totalKills: 0,
  coins: 0,
  coinBreakdown: {
    enemyDrops: 0,
    bossKills: 0,
    chestDrops: 0,
    survivalBonus: 0,
    killMilestones: 0,
    completionBonus: 0,
    firstClearBonus: 0,
  },
  timeSurvived: 0,
  weapons: [],
  passives: [],
  catalysts: [],
  selectedClassId: null,
  effectiveStats: { ...GLOBAL_BASE_STATS },
  upgradeChoices: [],
  rerollsRemaining: 2,
  banishesRemaining: 2,
  banishedIds: new Set(),
  revivalsRemaining: 0,
  bossActive: false,
  bossesDefeatedThisRun: [],
  doubleTime: false,
  killMilestonesHit: [],
  previousPhase: 'menu',

  setPhase: (phase) => set({ phase }),

  goToMenu: () => set({
    phase: 'menu',
    hp: 100,
    maxHp: 100,
    xp: 0,
    level: 1,
    kills: 0,
    totalKills: 0,
    coins: 0,
    coinBreakdown: {
      enemyDrops: 0, bossKills: 0, chestDrops: 0,
      survivalBonus: 0, killMilestones: 0, completionBonus: 0, firstClearBonus: 0,
    },
    timeSurvived: 0,
    weapons: [],
    passives: [],
    catalysts: [],
    selectedClassId: null,
    upgradeChoices: [],
    banishedIds: new Set(),
    bossActive: false,
    bossesDefeatedThisRun: [],
    killMilestonesHit: [],
  }),

  goToClassSelect: () => set({ phase: 'class_select' }),

  startRun: (classId, doubleTime, metaBonuses, metaRerolls, metaBanishes, metaRevival, extraChoice) => {
    // Base stats will be set by the game loop after reading class data
    set({
      phase: 'playing',
      selectedClassId: classId,
      doubleTime,
      hp: 100, // will be overridden by class
      maxHp: 100,
      xp: 0,
      level: 1,
      kills: 0,
      totalKills: 0,
      coins: 0,
      coinBreakdown: {
        enemyDrops: 0, bossKills: 0, chestDrops: 0,
        survivalBonus: 0, killMilestones: 0, completionBonus: 0, firstClearBonus: 0,
      },
      timeSurvived: 0,
      weapons: [],
      passives: [],
      catalysts: [],
      upgradeChoices: [],
      rerollsRemaining: 2 + metaRerolls,
      banishesRemaining: 2 + metaBanishes,
      banishedIds: new Set(),
      revivalsRemaining: metaRevival,
      bossActive: false,
      bossesDefeatedThisRun: [],
      killMilestonesHit: [],
    });
  },

  takeDamage: (amount) => {
    const s = get();
    const reduced = Math.max(1, amount - s.effectiveStats.armor);
    // Check shield first
    // Shield handling is done at the engine level
    const newHp = Math.max(0, s.hp - reduced);
    set({ hp: newHp });
    if (newHp <= 0) {
      if (s.revivalsRemaining > 0) {
        get().revive();
      } else {
        get().die();
      }
    }
  },

  heal: (amount) => {
    set((s) => ({ hp: Math.min(s.maxHp, s.hp + amount) }));
  },

  addXP: (amount) => {
    const s = get();
    const scaledAmount = Math.floor(amount * s.effectiveStats.growth);
    let xp = s.xp + scaledAmount;
    let level = s.level;
    let shouldLevelUp = false;

    while (xp >= xpRequired(level)) {
      xp -= xpRequired(level);
      level++;
      shouldLevelUp = true;
    }

    set({ xp, level });

    if (shouldLevelUp) {
      // The game loop handles showing the upgrade picker
    }

    return shouldLevelUp;
  },

  addKill: () => {
    set((s) => ({
      kills: s.kills + 1,
      totalKills: s.totalKills + 1,
    }));
    get().checkKillMilestones();
  },

  addCoins: (amount, source) => {
    set((s) => ({
      coins: s.coins + amount,
      coinBreakdown: {
        ...s.coinBreakdown,
        [source]: s.coinBreakdown[source] + amount,
      },
    }));
  },

  tick: (delta) => {
    const s = get();
    if (s.phase !== 'playing') return;

    const newTime = s.timeSurvived + delta;

    // Survival time bonus: 1 coin per 15 seconds
    const prevBonusCount = Math.floor(s.timeSurvived / 15);
    const newBonusCount = Math.floor(newTime / 15);
    if (newBonusCount > prevBonusCount) {
      const bonusCoins = newBonusCount - prevBonusCount;
      get().addCoins(bonusCoins, 'survivalBonus');
    }

    // HP regen
    const regenAmount = s.effectiveStats.hpRegen * delta;
    const newHp = Math.min(s.maxHp, s.hp + regenAmount);

    set({
      timeSurvived: newTime,
      hp: newHp,
    });
  },

  setUpgradeChoices: (choices) => set({ upgradeChoices: choices, phase: 'upgrading' }),

  pickUpgrade: (index) => {
    const s = get();
    const choice = s.upgradeChoices[index];
    if (!choice) return;

    switch (choice.type) {
      case 'new_weapon':
        get().addWeapon(choice.weaponId);
        break;
      case 'upgrade_weapon':
        get().upgradeWeapon(choice.weaponId);
        break;
      case 'new_passive':
        get().addPassive(choice.passiveId);
        break;
      case 'upgrade_passive':
        get().upgradePassive(choice.passiveId);
        break;
      case 'new_catalyst':
        get().addCatalyst(choice.catalystId);
        break;
      case 'upgrade_catalyst':
        get().upgradeCatalyst(choice.catalystId);
        break;
      case 'gold':
        get().addCoins(choice.amount, 'chestDrops');
        break;
    }

    set({ phase: 'playing', upgradeChoices: [] });
  },

  reroll: (newChoices) => {
    const s = get();
    if (s.rerollsRemaining <= 0) return;
    set({ rerollsRemaining: s.rerollsRemaining - 1, upgradeChoices: newChoices });
  },

  banish: (index) => {
    const s = get();
    if (s.banishesRemaining <= 0) return;
    const choice = s.upgradeChoices[index];
    if (!choice) return;

    const newBanished = new Set(s.banishedIds);
    if (choice.type === 'new_weapon' || choice.type === 'upgrade_weapon') {
      newBanished.add(choice.weaponId);
    } else if (choice.type === 'new_passive' || choice.type === 'upgrade_passive') {
      newBanished.add(choice.passiveId);
    } else if (choice.type === 'new_catalyst' || choice.type === 'upgrade_catalyst') {
      newBanished.add(choice.catalystId);
    }

    const newChoices = s.upgradeChoices.filter((_, i) => i !== index);
    set({
      banishesRemaining: s.banishesRemaining - 1,
      banishedIds: newBanished,
      upgradeChoices: newChoices,
    });
  },

  addWeapon: (weaponId) => {
    set((s) => {
      if (s.weapons.length >= 6) return s;
      if (s.weapons.some((w) => w.weaponId === weaponId)) return s;
      return { weapons: [...s.weapons, { weaponId, level: 1, evolved: false }] };
    });
  },

  upgradeWeapon: (weaponId) => {
    set((s) => ({
      weapons: s.weapons.map((w) =>
        w.weaponId === weaponId && w.level < 8
          ? { ...w, level: w.level + 1 }
          : w
      ),
    }));
  },

  evolveWeapon: (weaponId, evolvedId, _consumedCatalystId) => {
    set((s) => ({
      weapons: s.weapons.map((w) =>
        w.weaponId === weaponId
          ? { weaponId: evolvedId, level: w.level, evolved: true }
          : w
      ),
    }));
  },

  addPassive: (passiveId) => {
    set((s) => {
      if (s.passives.length >= 6) return s;
      if (s.passives.some((p) => p.passiveId === passiveId)) return s;
      return { passives: [...s.passives, { passiveId, level: 1 }] };
    });
  },

  upgradePassive: (passiveId) => {
    set((s) => ({
      passives: s.passives.map((p) =>
        p.passiveId === passiveId && p.level < 5
          ? { ...p, level: p.level + 1 }
          : p
      ),
    }));
  },

  addCatalyst: (catalystId) => {
    set((s) => {
      // Catalysts and passives share 6 slots
      if (s.passives.length + s.catalysts.length >= 6) return s;
      if (s.catalysts.some((c) => c.catalystId === catalystId)) return s;
      return { catalysts: [...s.catalysts, { catalystId, level: 1 }] };
    });
  },

  upgradeCatalyst: (catalystId) => {
    set((s) => ({
      catalysts: s.catalysts.map((c) =>
        c.catalystId === catalystId && c.level < 3
          ? { ...c, level: c.level + 1 }
          : c
      ),
    }));
  },

  consumeCatalyst: (catalystId) => {
    set((s) => ({
      catalysts: s.catalysts.filter((c) => c.catalystId !== catalystId),
    }));
  },

  setEffectiveStats: (stats) => set({ effectiveStats: stats, maxHp: stats.maxHp }),

  setBossActive: (active) => set({ bossActive: active }),

  recordBossKill: (bossId) => {
    set((s) => ({
      bossesDefeatedThisRun: s.bossesDefeatedThisRun.includes(bossId)
        ? s.bossesDefeatedThisRun
        : [...s.bossesDefeatedThisRun, bossId],
    }));
  },

  togglePause: () => {
    const s = get();
    if (s.phase === 'playing') {
      set({ phase: 'paused', previousPhase: 'playing' });
    } else if (s.phase === 'paused') {
      set({ phase: s.previousPhase });
    }
  },

  revive: () => {
    set((s) => ({
      phase: 'playing',
      hp: s.maxHp,
      revivalsRemaining: s.revivalsRemaining - 1,
    }));
  },

  die: () => set({ phase: 'dead' }),

  victory: () => {
    const s = get();
    // Completion bonus
    get().addCoins(150, 'completionBonus');
    set({ phase: 'victory' });
  },

  checkKillMilestones: () => {
    const s = get();
    const milestones = [
      { kills: 500, coins: 15 },
      { kills: 1500, coins: 35 },
      { kills: 3000, coins: 60 },
      { kills: 5000, coins: 120 },
    ];

    for (const m of milestones) {
      if (s.totalKills >= m.kills && !s.killMilestonesHit.includes(m.kills)) {
        set((s) => ({
          killMilestonesHit: [...s.killMilestonesHit, m.kills],
        }));
        get().addCoins(m.coins, 'killMilestones');
      }
    }
  },
}));
