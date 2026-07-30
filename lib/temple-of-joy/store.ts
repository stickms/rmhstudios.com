/**
 * The store.
 *
 * A thin zustand shell over the pure functions in `actions.ts` and `tick.ts`.
 * Deliberately thin: keeping the rules out of the store is what lets the same
 * `applyTick` run the live game and the offline catch-up, and what lets any of
 * it be reasoned about without a React tree.
 *
 * Reads are the interesting part — see `components/temple-of-joy/hooks.ts`.
 * Nothing here should be subscribed to naively; the state changes sixty times
 * a second.
 */
'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  BlessingKind,
  BuyQty,
  GameState,
  GoodId,
  PrayerId,
  SaintId,
  SeedId,
  SoilId,
  SourceId,
  TabId,
} from './types';
import * as Actions from './actions';
import { applyTick } from './tick';
import { ZERO_SOURCES } from './data/sources';
import { createGarden } from './minigames/garden';
import { createChoir } from './minigames/choir';
import { createExchange } from './minigames/exchange';
import { createHours } from './minigames/hours';
import { createManna } from './minigames/manna';
import {
  computeCanAscend,
  computeAscensionGrace,
  computeGrossJps,
  computeJps,
  computeMultipliers,
  computeTouch,
} from './engine';

export function createInitialState(): GameState {
  const now = Date.now();
  return {
    joy: 0,
    runJoy: 0,
    lifetimeJoy: 0,
    peakJoy: 0,

    sources: { ...ZERO_SOURCES },
    sourceLevels: { ...ZERO_SOURCES },
    sourceEarnings: { ...ZERO_SOURCES },

    blessings: new Set(),
    trophies: new Set(),

    grace: 0,
    graceSpent: 0,
    graceEarned: 0,
    legacy: new Set(),
    ascensions: 0,
    keepsakes: [],

    manna: createManna(),

    totalTouches: 0,
    recentTouches: [],
    touchesAtOpen: 0,

    halos: [],
    // The first halo comes early, so a new player meets the mechanic before
    // they have decided what this game is.
    haloTimer: 90,
    halosCaught: 0,
    buffs: [],
    haloStreak: 0,

    rapture: 0,
    sinners: [],
    sinnersStruck: 0,
    sinnerHarvest: 0,

    garden: createGarden(),
    choir: createChoir(),
    exchange: createExchange(),
    hours: createHours(),

    lastTick: now,
    lastSaved: now,
    openedAt: now,
    playtime: 0,
    runPlaytime: 0,

    vigil: { seconds: 0, joy: 0, sinnerJoy: 0, manna: 0, pending: false },

    theme: 'dawn',
    numberFormat: 'named',
    soundEnabled: true,
    musicVolume: 0.35,
    sfxVolume: 0.5,
    stewardEnabled: false,
    stewardTimer: 5,
    confirmAscend: true,
    reducedFlourish: false,

    tab: 'temple',
    blessingFilter: 'all',
    buyQty: 1,
    levelMode: false,
    showAscendDialog: false,
    showVigilDialog: false,
    showMannaDialog: false,
    initialized: false,
    notices: [],
  };
}

interface TempleStore extends GameState {
  // ── Derived ──
  getJps: () => number;
  getGrossJps: () => number;
  getTouch: () => number;
  getMultipliers: () => ReturnType<typeof computeMultipliers>;
  getCanAscend: () => boolean;
  getAscensionGrace: () => number;

  // ── The loop ──
  tick: () => void;

  // ── Play ──
  touch: () => void;
  buySource: (id: SourceId) => void;
  sellSource: (id: SourceId, n: number) => void;
  buyBlessing: (id: string) => void;
  levelSource: (id: SourceId) => void;
  catchHalo: (id: number) => void;
  strikeSinner: (id: number) => void;
  strikeAllSinners: () => void;

  // ── Garden ──
  sow: (index: number) => void;
  harvest: (index: number) => void;
  harvestAll: () => void;
  selectSeed: (seed: SeedId | null) => void;
  till: (soil: SoilId) => void;

  // ── Choir ──
  seatSaint: (stall: 0 | 1 | 2, saint: SaintId | null) => void;

  // ── Exchange ──
  buyGood: (good: GoodId, units: number) => void;
  sellGood: (good: GoodId, units: number) => void;
  focusGood: (good: GoodId) => void;

  // ── Hours ──
  pray: (prayer: PrayerId) => void;

  // ── Ascension ──
  buyLegacy: (id: string) => void;
  setKeepsakes: (ids: string[]) => void;
  ascend: () => void;

  // ── UI ──
  setTab: (tab: TabId) => void;
  setBlessingFilter: (filter: BlessingKind | 'all') => void;
  setBuyQty: (qty: BuyQty) => void;
  setLevelMode: (on: boolean) => void;
  setTheme: (theme: GameState['theme']) => void;
  setNumberFormat: (format: GameState['numberFormat']) => void;
  setSoundEnabled: (on: boolean) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setStewardEnabled: (on: boolean) => void;
  setConfirmAscend: (on: boolean) => void;
  setReducedFlourish: (on: boolean) => void;
  setShowAscendDialog: (open: boolean) => void;
  setShowVigilDialog: (open: boolean) => void;
  setShowMannaDialog: (open: boolean) => void;
  dismissNotice: (id: number) => void;

  // ── Persistence ──
  load: (partial: Partial<GameState>) => void;
  reset: () => void;
}

export const useTempleStore = create<TempleStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    getJps: () => computeJps(get()),
    getGrossJps: () => computeGrossJps(get()),
    getTouch: () => computeTouch(get()),
    getMultipliers: () => computeMultipliers(get()),
    getCanAscend: () => computeCanAscend(get()),
    getAscensionGrace: () => computeAscensionGrace(get()),

    tick: () => set((s) => applyTick(s)),

    touch: () => set((s) => Actions.doTouch(s)),
    buySource: (id) => set((s) => Actions.doBuySourceQty(s, id)),
    sellSource: (id, n) => set((s) => Actions.doSellSource(s, id, n)),
    buyBlessing: (id) => set((s) => Actions.doBuyBlessing(s, id)),
    levelSource: (id) => set((s) => Actions.doLevelSource(s, id)),
    catchHalo: (id) => set((s) => Actions.doCatchHalo(s, id)),
    strikeSinner: (id) => set((s) => Actions.doStrikeSinner(s, id)),
    strikeAllSinners: () => set((s) => Actions.doStrikeAllSinners(s)),

    sow: (index) => set((s) => Actions.doSow(s, index)),
    harvest: (index) => set((s) => Actions.doHarvest(s, index)),
    harvestAll: () => set((s) => Actions.doHarvestAll(s)),
    selectSeed: (seed) => set((s) => Actions.doSelectSeed(s, seed)),
    till: (soil) => set((s) => Actions.doTill(s, soil)),

    seatSaint: (stall, saint) => set((s) => Actions.doSeatSaint(s, stall, saint)),

    buyGood: (good, units) => set((s) => Actions.doBuyGood(s, good, units)),
    sellGood: (good, units) => set((s) => Actions.doSellGood(s, good, units)),
    focusGood: (good) => set((s) => Actions.doFocusGood(s, good)),

    pray: (prayer) => set((s) => Actions.doPray(s, prayer)),

    buyLegacy: (id) => set((s) => Actions.doBuyLegacy(s, id)),
    setKeepsakes: (ids) => set((s) => Actions.doSetKeepsakes(s, ids)),
    ascend: () => set((s) => Actions.doAscend(s)),

    setTab: (tab) => set({ tab }),
    setBlessingFilter: (blessingFilter) => set({ blessingFilter }),
    setBuyQty: (buyQty) => set({ buyQty }),
    setLevelMode: (levelMode) => set({ levelMode }),
    setTheme: (theme) => set({ theme }),
    setNumberFormat: (numberFormat) => set({ numberFormat }),
    setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    setMusicVolume: (musicVolume) => set({ musicVolume }),
    setSfxVolume: (sfxVolume) => set({ sfxVolume }),
    setStewardEnabled: (stewardEnabled) => set({ stewardEnabled }),
    setConfirmAscend: (confirmAscend) => set({ confirmAscend }),
    setReducedFlourish: (reducedFlourish) => set({ reducedFlourish }),
    setShowAscendDialog: (showAscendDialog) => set({ showAscendDialog }),
    setShowVigilDialog: (showVigilDialog) => set({ showVigilDialog }),
    setShowMannaDialog: (showMannaDialog) => set({ showMannaDialog }),
    dismissNotice: (id) => set((s) => Actions.doDismissNotice(s, id)),

    load: (partial) => set(partial),
    reset: () => set(createInitialState()),
  })),
);

/** Read the live state outside React. */
export const temple = () => useTempleStore.getState();
