'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  GameState,
  GeneratorId,
  ActiveBuff,
  GoldenKind,
  NumberFormat,
  BuyQty,
  TabId,
} from './types';
import {
  GENERATORS,
  UPGRADE_MAP,
  SKILL_MAP,
  PERK_MAP,
  ACHIEVEMENTS,
} from './data';
import {
  totalCps,
  clickPower,
  generatorBulkCost,
  resolveBuyCount,
  permanentMultiplier,
  pendingReputation,
  pendingEquity,
  startingLoc,
  goldenPowerMultiplier,
} from './engine';
import { applyTick, initialGoldenTimer } from './tick';

// ─── Initial state ────────────────────────────────────────────────────────────

function emptyGenerators(): Record<GeneratorId, number> {
  return Object.fromEntries(GENERATORS.map((g) => [g.id, 0]));
}

export function createInitialState(): GameState {
  const now = Date.now();
  return {
    loc: 0,
    lifetimeLoc: 0,
    totalLoc: 0,
    reputation: 0,
    reputationEarned: 0,
    equity: 0,
    equityEarned: 0,
    generators: emptyGenerators(),
    upgrades: [],
    skills: [],
    perks: [],
    achievements: [],
    totalClicks: 0,
    handmadeLoc: 0,
    shipCount: 0,
    ascensionCount: 0,
    goldenClicks: 0,
    aiCalls: 0,
    activeBuffs: [],
    golden: null,
    goldenTimer: 90,
    chat: [],
    lastTick: now,
    lastSaved: now,
    playtime: 0,
    startedAt: now,
    offlineLocOnLoad: 0,
    offlineSecondsOnLoad: 0,
    numberFormat: 'short',
    activeTab: 'studio',
    buyQty: 1,
    soundEnabled: true,
  };
}

// ─── Buff helper ──────────────────────────────────────────────────────────────

let buffSeq = 0;
function makeBuff(
  name: string,
  emoji: string,
  cpsMult: number,
  clickMult: number,
  duration: number,
): ActiveBuff {
  return { uid: `b${++buffSeq}-${Date.now()}`, name, emoji, cpsMult, clickMult, remaining: duration, duration };
}

// ─── Golden commit reward rolling ──────────────────────────────────────────────

const GOLDEN_WEIGHTS: { kind: GoldenKind; weight: number }[] = [
  { kind: 'lucky', weight: 40 },
  { kind: 'frenzy', weight: 30 },
  { kind: 'clickFrenzy', weight: 18 },
  { kind: 'codeStorm', weight: 7 },
  { kind: 'buildFail', weight: 5 },
];

function rollGoldenKind(): GoldenKind {
  const total = GOLDEN_WEIGHTS.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (const g of GOLDEN_WEIGHTS) {
    r -= g.weight;
    if (r <= 0) return g.kind;
  }
  return 'lucky';
}

export interface GoldenResult {
  kind: GoldenKind;
  message: string;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface Store extends GameState {
  // Derived
  getCps: () => number;
  getClick: () => number;
  getMultiplier: () => number;
  getPendingReputation: () => number;
  getPendingEquity: () => number;

  // Core actions
  tick: (dt: number) => void;
  click: () => void;
  buyGenerator: (id: GeneratorId) => void;
  buyUpgrade: (id: string) => void;
  buySkill: (id: string) => void;
  buyPerk: (id: string) => void;
  clickGolden: () => GoldenResult | null;
  ship: () => void;
  ascend: () => void;
  startSprint: (goal: string) => void;
  pushChat: (role: 'user' | 'assistant', content: string) => void;
  bumpAiCalls: () => void;
  auditAchievements: () => string[];

  // Settings / UI
  setTab: (t: TabId) => void;
  setBuyQty: (q: BuyQty) => void;
  setNumberFormat: (f: NumberFormat) => void;
  setSoundEnabled: (b: boolean) => void;
  clearOfflineFlash: () => void;

  // Persistence
  loadState: (p: Partial<GameState>) => void;
  setOfflineFlash: (loc: number, seconds: number) => void;
  hardReset: () => void;
}

export const useGameStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    // ── Derived ──
    getCps: () => totalCps(get()),
    getClick: () => clickPower(get()),
    getMultiplier: () => permanentMultiplier(get()),
    getPendingReputation: () => pendingReputation(get()),
    getPendingEquity: () => pendingEquity(get()),

    // ── Core ──
    tick: (dt: number) => set((s) => applyTick(s, dt)),

    click: () =>
      set((s) => {
        const gain = clickPower(s);
        return {
          loc: s.loc + gain,
          lifetimeLoc: s.lifetimeLoc + gain,
          totalLoc: s.totalLoc + gain,
          handmadeLoc: s.handmadeLoc + gain,
          totalClicks: s.totalClicks + 1,
        };
      }),

    buyGenerator: (id: GeneratorId) =>
      set((s) => {
        const owned = s.generators[id] ?? 0;
        const n = resolveBuyCount(s, id);
        if (n <= 0) return {};
        const cost = generatorBulkCost(id, owned, n);
        if (s.loc < cost) return {};
        return {
          loc: s.loc - cost,
          generators: { ...s.generators, [id]: owned + n },
        };
      }),

    buyUpgrade: (id: string) =>
      set((s) => {
        const u = UPGRADE_MAP[id];
        if (!u || s.upgrades.includes(id) || s.loc < u.cost) return {};
        return { loc: s.loc - u.cost, upgrades: [...s.upgrades, id] };
      }),

    buySkill: (id: string) =>
      set((s) => {
        const sk = SKILL_MAP[id];
        if (!sk || s.skills.includes(id) || s.reputation < sk.cost) return {};
        if (sk.requires && !sk.requires.every((r) => s.skills.includes(r))) return {};
        return { reputation: s.reputation - sk.cost, skills: [...s.skills, id] };
      }),

    buyPerk: (id: string) =>
      set((s) => {
        const p = PERK_MAP[id];
        if (!p || s.perks.includes(id) || s.equity < p.cost) return {};
        if (p.requires && !p.requires.every((r) => s.perks.includes(r))) return {};
        return { equity: s.equity - p.cost, perks: [...s.perks, id] };
      }),

    clickGolden: () => {
      const s = get();
      if (!s.golden) return null;
      const kind = rollGoldenKind();
      const power = goldenPowerMultiplier(s);
      const cps = totalCps(s);
      let result: GoldenResult;

      if (kind === 'lucky') {
        const gain = (cps * 60 * 7 + s.loc * 0.1) * power;
        set((st) => ({
          loc: st.loc + gain,
          lifetimeLoc: st.lifetimeLoc + gain,
          totalLoc: st.totalLoc + gain,
          goldenClicks: st.goldenClicks + 1,
          golden: null,
        }));
        result = { kind, message: `Lucky! +${Math.floor(gain).toLocaleString('en-US')} LoC` };
      } else if (kind === 'frenzy') {
        set((st) => ({
          activeBuffs: [...st.activeBuffs, makeBuff('Code Frenzy', '🔥', 7, 1, 60)],
          goldenClicks: st.goldenClicks + 1,
          golden: null,
        }));
        result = { kind, message: 'Code Frenzy! Production ×7 for 60s' };
      } else if (kind === 'clickFrenzy') {
        set((st) => ({
          activeBuffs: [...st.activeBuffs, makeBuff('Click Frenzy', '🖱️', 1, 777, 12)],
          goldenClicks: st.goldenClicks + 1,
          golden: null,
        }));
        result = { kind, message: 'Click Frenzy! Clicks ×777 for 12s' };
      } else if (kind === 'codeStorm') {
        set((st) => ({
          activeBuffs: [...st.activeBuffs, makeBuff('Code Storm', '🌩️', 15, 1, 20)],
          goldenClicks: st.goldenClicks + 1,
          golden: null,
        }));
        result = { kind, message: 'CODE STORM! Production ×15 for 20s' };
      } else {
        // buildFail — the "wrath" outcome
        set((st) => ({
          activeBuffs: [...st.activeBuffs, makeBuff('Build Failed', '🔴', 0.5, 1, 30)],
          goldenClicks: st.goldenClicks + 1,
          golden: null,
        }));
        result = { kind, message: 'Build Failed… production ×0.5 for 30s. Rollback!' };
      }
      return result;
    },

    ship: () =>
      set((s) => {
        const gain = pendingReputation(s);
        if (gain <= 0) return {};
        const reputation = s.reputation + gain;
        const reputationEarned = s.reputationEarned + gain;
        const seed = startingLoc({ ...s, reputationEarned });
        return {
          reputation,
          reputationEarned,
          shipCount: s.shipCount + 1,
          loc: seed,
          lifetimeLoc: 0,
          generators: emptyGenerators(),
          upgrades: [],
          activeBuffs: [],
          golden: null,
          goldenTimer: initialGoldenTimer(s),
        };
      }),

    ascend: () =>
      set((s) => {
        const gain = pendingEquity(s);
        if (gain <= 0) return {};
        const equity = s.equity + gain;
        const equityEarned = s.equityEarned + gain;
        const seed = startingLoc({ ...s, equityEarned, reputationEarned: 0, skills: [] });
        return {
          equity,
          equityEarned,
          ascensionCount: s.ascensionCount + 1,
          reputation: 0,
          reputationEarned: 0,
          skills: [],
          shipCount: 0,
          loc: seed,
          lifetimeLoc: 0,
          generators: emptyGenerators(),
          upgrades: [],
          activeBuffs: [],
          golden: null,
          goldenTimer: initialGoldenTimer(s),
        };
      }),

    startSprint: (goal: string) =>
      set((s) => {
        // Avoid stacking duplicate sprint buffs.
        const filtered = s.activeBuffs.filter((b) => b.name !== 'AI Sprint');
        const buff = makeBuff('AI Sprint', '🏃', 3, 3, 120);
        // Stash the goal as the buff's display name suffix via a chat note.
        return {
          activeBuffs: [...filtered, buff],
          chat: goal
            ? [...s.chat, { role: 'assistant' as const, content: `📋 Sprint goal: ${goal} (Production & clicks ×3 for 2 min!)`, at: Date.now() }]
            : s.chat,
        };
      }),

    pushChat: (role, content) =>
      set((s) => ({ chat: [...s.chat, { role, content, at: Date.now() }].slice(-40) })),

    bumpAiCalls: () => set((s) => ({ aiCalls: s.aiCalls + 1 })),

    auditAchievements: () => {
      const s = get();
      const newly: string[] = [];
      for (const a of ACHIEVEMENTS) {
        if (!s.achievements.includes(a.id) && a.check(s)) newly.push(a.id);
      }
      if (newly.length) set((st) => ({ achievements: [...st.achievements, ...newly] }));
      return newly;
    },

    // ── Settings / UI ──
    setTab: (t) => set({ activeTab: t }),
    setBuyQty: (q) => set({ buyQty: q }),
    setNumberFormat: (f) => set({ numberFormat: f }),
    setSoundEnabled: (b) => set({ soundEnabled: b }),
    clearOfflineFlash: () => set({ offlineLocOnLoad: 0, offlineSecondsOnLoad: 0 }),

    // ── Persistence ──
    loadState: (p) => set(p),
    setOfflineFlash: (loc, seconds) =>
      set((s) => ({
        loc: s.loc + loc,
        lifetimeLoc: s.lifetimeLoc + loc,
        totalLoc: s.totalLoc + loc,
        offlineLocOnLoad: loc,
        offlineSecondsOnLoad: seconds,
      })),
    hardReset: () => set({ ...createInitialState() }),
  })),
);
