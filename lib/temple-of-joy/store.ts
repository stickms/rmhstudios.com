'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { GameState, BuildingId, RelicId, UpgradePath } from './types';
import { applyTick } from './tick';
import * as Actions from './actions';
import {
  computeTotalHPS, computeHPC, computeCanTranscend,
  computeBlissShards, computeEffectiveSatisfaction, computeIsIdle,
  computeMaxAffordable, computeGlobalHPSMultiplier,
} from './engine';
import { INITIAL_BUILDINGS } from './data/buildings';

// ─── Initial State ────────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  const now = Date.now();
  return {
    happiness: 0,
    lifetimeHappiness: 0,
    peakHappiness: 0,
    peakKarma: 0,
    karma: 0,
    blissShards: 0,
    buildings: { ...INITIAL_BUILDINGS },
    upgrades: new Set<string>(),
    activeRelics: [],
    maxRelicSlots: 5,
    prestigeCount: 0,
    wheelPurchased: new Set<string>(),
    samsaraGiftStacks: 0,
    lastSaved: now,
    totalPlaytime: 0,
    totalClicks: 0,
    totalPilgrimages: 0,
    totalVibeChecks: 0,
    totalEventsResolved: 0,
    achievements: new Set<string>(),
    milestones: new Set<string>(),
    baselineHappiness: 0,
    vibeCheckTimer: Math.random() * 240 + 180,
    vibeBuff: null,
    pilgrimageActive: false,
    pilgrimageTimer: 0,
    pilgrimageCooldown: 0,
    ritualCooldown: 0,
    recentClickTimes: [],
    eventTimer: Math.random() * 480 + 120,
    pendingEvent: null,
    lastEventEffect: null,
    activeBuffs: [],
    permanentHPSBonus: 0,
    permanentHPCBonus: 0,
    lastClickTime: now,
    pageOpenTime: now,
    offlineHappinessOnLoad: 0,
    offlineSecondsOnLoad: 0,
    theme: 'dark',
    numberFormat: 'abbreviated',
    soundEnabled: false,
    soundVolume: 0.5,
    activeTab: 'temple',
    upgradePathFilter: 'all',
    buildingBuyQty: 1,
    showTranscendenceModal: false,
    showOfflineModal: false,
    showEventModal: false,
    gameInitialized: false,
  };
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface TempleStore extends GameState {
  // Derived (computed on demand from store)
  getHPS: () => number;
  getHPC: () => number;
  getGlobalHPSMultiplier: () => number;
  getCanTranscend: () => boolean;
  getBlissShards: () => number;
  getEffectiveSatisfaction: () => number;
  getIsIdle: () => boolean;

  // Actions
  tick: (deltaMs: number) => void;
  click: () => void;
  buyBuilding: (id: BuildingId) => void;
  buyBuildingN: (id: BuildingId, n: number) => void;
  buyBuildingMax: (id: BuildingId) => void;
  purchaseUpgrade: (id: string) => void;
  equipRelic: (id: RelicId) => void;
  unequipRelic: (id: RelicId) => void;
  triggerPilgrimage: () => void;
  passVibeCheck: () => void;
  transcend: () => void;
  purchaseWheelUpgrade: (id: string) => void;
  resolveEvent: (eventId: string, choiceIndex: number) => void;
  makeOffering: (tier: 1 | 2 | 3) => void;

  // UI setters
  setActiveTab: (tab: GameState['activeTab']) => void;
  setUpgradePathFilter: (filter: UpgradePath | 'all') => void;
  setBuildingBuyQty: (qty: 1 | 10 | 100 | 'max') => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setNumberFormat: (fmt: 'abbreviated' | 'scientific') => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (vol: number) => void;
  setShowTranscendenceModal: (show: boolean) => void;
  setShowOfflineModal: (show: boolean) => void;
  setShowEventModal: (show: boolean) => void;

  // Persistence
  loadState: (partial: Partial<GameState>) => void;
  resetRun: () => void;
}

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useTempleStore = create<TempleStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    // ── Derived getters ──
    getHPS: () => computeTotalHPS(get()),
    getHPC: () => computeHPC(get()),
    getGlobalHPSMultiplier: () => computeGlobalHPSMultiplier(get()),
    getCanTranscend: () => computeCanTranscend(get()),
    getBlissShards: () => computeBlissShards(get().lifetimeHappiness, get().wheelPurchased),
    getEffectiveSatisfaction: () => computeEffectiveSatisfaction(get()),
    getIsIdle: () => computeIsIdle(get()),

    // ── Actions ──
    tick: (deltaMs: number) => set(state => applyTick(state, deltaMs)),
    click: () => set(state => Actions.doClick(state)),
    buyBuilding: (id: BuildingId) => set(state => Actions.doBuyBuilding(state, id)),
    buyBuildingN: (id: BuildingId, n: number) => set(state => Actions.doBuyBuildingN(state, id, n)),
    buyBuildingMax: (id: BuildingId) => set(state => Actions.doBuyBuildingN(state, id, computeMaxAffordable(id, state))),
    purchaseUpgrade: (id: string) => set(state => Actions.doPurchaseUpgrade(state, id)),
    equipRelic: (id: RelicId) => set(state => Actions.doEquipRelic(state, id)),
    unequipRelic: (id: RelicId) => set(state => Actions.doUnequipRelic(state, id)),
    triggerPilgrimage: () => set(state => Actions.doTriggerPilgrimage(state)),
    passVibeCheck: () => set(state => Actions.doPassVibeCheck(state)),
    transcend: () => set(state => Actions.doTriggerTranscendence(state)),
    purchaseWheelUpgrade: (id: string) => set(state => Actions.doPurchaseWheelUpgrade(state, id)),
    resolveEvent: (eventId: string, choiceIndex: number) =>
      set(state => Actions.doResolveEvent(state, eventId, choiceIndex)),
    makeOffering: (tier: 1 | 2 | 3) => set(state => Actions.doMakeOffering(state, tier)),

    // ── UI setters ──
    setActiveTab: (tab) => set({ activeTab: tab }),
    setUpgradePathFilter: (filter) => set({ upgradePathFilter: filter }),
    setBuildingBuyQty: (qty) => set({ buildingBuyQty: qty }),
    setTheme: (theme) => set({ theme }),
    setNumberFormat: (fmt) => set({ numberFormat: fmt }),
    setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
    setSoundVolume: (vol) => set({ soundVolume: vol }),
    setShowTranscendenceModal: (show) => set({ showTranscendenceModal: show }),
    setShowOfflineModal: (show) => set({ showOfflineModal: show }),
    setShowEventModal: (show) => set({ showEventModal: show }),

    // ── Persistence ──
    loadState: (partial: Partial<GameState>) => set(partial),
    resetRun: () => set(createInitialState()),
  }))
);
