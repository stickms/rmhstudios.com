/**
 * Isleworks — the game store.
 *
 * One Zustand store for the city and the editing session, plus a deliberately
 * separate one-field store for the month clock.
 *
 * The split is a performance decision, not an organisational one. The clock
 * moves twelve times a second; the city changes when the player does something
 * or a month turns over. Keeping `progress` in the main store would re-render
 * every HUD panel at 12 Hz for the sake of one progress ring, so the ring
 * subscribes to `useIsleworksClock` and nothing else does.
 *
 * `recomputeDerived` mutates tiles in place (see the note in `simulation.ts`),
 * so identity on `tiles` is useless as a change signal. `commit()` replaces the
 * top-level `city` object on every mutation instead, and that single reference
 * swap is what every scene layer and HUD panel re-renders on. There is
 * deliberately no second `revision` counter to keep in step with it.
 */

import { create } from 'zustand';
import {
  buildableTilesIn,
  clearSave,
  createCity,
  fromSavedCity,
  loadCity,
  makeInstance,
  purchasableParcels,
  saveCity,
  unlockParcel,
  type SavedCity,
} from './city';
import { getDefinition, tryGetDefinition } from './catalog';
import { EVENT_INTERVAL, rollEvent } from './events';
import {
  checkPlacement,
  index,
  instanceTiles,
  parcelIndexFor,
  parcelPrice,
  type PlacementError,
} from './grid';
import { evaluateObjectives, objectiveDefinition } from './objectives';
import { advanceMonth, recomputeDerived } from './simulation';
import { makeRng } from './terrain';
import type { CityState, GameSpeed, ToolMode } from './types';

/** Real seconds per in-game month at 1×. */
export const MONTH_SECONDS = 24;

export const SPEED_MULTIPLIER: Record<GameSpeed, number> = { 0: 0, 1: 1, 2: 2.5, 3: 5 };

export type OverlayMode = 'none' | 'power' | 'water' | 'pollution' | 'land-value' | 'traffic';

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

const PLACEMENT_MESSAGES: Record<PlacementError, string> = {
  'out-of-bounds': 'That is off the edge of the world.',
  locked: 'You do not own that land yet.',
  water: 'Nothing stands on open water.',
  occupied: 'Something is already there.',
  'needs-shore': 'This one has to touch the sea.',
  'needs-road': 'It needs a road alongside it.',
  'already-built': 'The island only needs one of those.',
  'too-expensive': 'Not enough in the treasury.',
};

interface IsleworksState {
  city: CityState;
  tool: ToolMode;
  selectedId: string | null;
  hover: { x: number; y: number } | null;
  speed: GameSpeed;
  overlay: OverlayMode;
  toasts: Toast[];
  /** Set once the player leaves the title screen. */
  started: boolean;
  /** Instance ids placed this session, for the rise animation. */
  freshIds: string[];

  start: (options?: { fresh?: boolean; seed?: number; saved?: SavedCity | null }) => void;
  setTool: (tool: ToolMode) => void;
  rotateTool: (delta: number) => void;
  cancelTool: () => void;
  setHover: (tile: { x: number; y: number } | null) => void;
  select: (instanceId: string | null) => void;
  setSpeed: (speed: GameSpeed) => void;
  setOverlay: (overlay: OverlayMode) => void;
  setTaxRate: (rate: number) => void;

  placeAt: (x: number, y: number) => boolean;
  bulldozeAt: (x: number, y: number) => boolean;
  buyParcelAt: (x: number, y: number) => boolean;
  claimObjective: (id: string) => void;

  advance: () => void;
  save: () => void;
  reset: () => void;
  /**
   * Internal — the HUD never calls this. Feedback belongs to the action that
   * caused it, so only store actions raise toasts.
   */
  pushToast: (text: string, tone: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

/** Bump the board and keep the objective list in step. One place, no drift. */
function commit(city: CityState): { city: CityState } {
  recomputeDerived(city);
  city.objectives = evaluateObjectives(city);
  return { city: { ...city } };
}

export const useIsleworks = create<IsleworksState>((set, get) => ({
  // A fixed seed for the island shown behind the title screen: the same
  // postcard every time you arrive, replaced the moment you press a button.
  city: createCity(1),
  tool: { kind: 'none' },
  selectedId: null,
  hover: null,
  speed: 1,
  overlay: 'none',
  toasts: [],
  started: false,
  freshIds: [],

  /**
   * Open a city.
   *
   * `saved` is the payload the caller has already resolved between this device
   * and the account — see `cloud.ts`. It falls back to the local copy so the
   * signature still works for callers that have not resolved anything (and for
   * a guest, where local *is* the only copy).
   */
  start: ({ fresh = false, seed, saved } = {}) => {
    const city = fresh ? createCity(seed) : (fromSavedCity(saved ?? null) ?? loadCity() ?? createCity(seed));
    set({ ...commit(city), started: true, speed: 1 });
  },

  setTool: (tool) => set({ tool, selectedId: tool.kind === 'none' ? get().selectedId : null }),

  rotateTool: (delta) =>
    set((s) =>
      s.tool.kind === 'place'
        ? { tool: { ...s.tool, rotation: (s.tool.rotation + delta + 4) % 4 } }
        : {},
    ),

  cancelTool: () => set({ tool: { kind: 'none' } }),
  setHover: (hover) => set({ hover }),
  select: (selectedId) => set({ selectedId, tool: { kind: 'none' } }),
  setSpeed: (speed) => set({ speed }),
  setOverlay: (overlay) => set({ overlay }),

  setTaxRate: (rate) => {
    const city = get().city;
    city.taxRate = Math.min(20, Math.max(4, Math.round(rate)));
    set(commit(city));
  },

  placeAt: (x, y) => {
    const state = get();
    const tool = state.tool;
    if (tool.kind !== 'place') return false;
    const city = state.city;
    const def = getDefinition(tool.definitionId);

    const check = checkPlacement(def, x, y, tool.rotation, {
      tiles: city.tiles,
      width: city.width,
      height: city.height,
      money: city.money,
      placedUnique: new Set(city.buildings.map((b) => b.definitionId)),
    });

    if (!check.ok) {
      state.pushToast(PLACEMENT_MESSAGES[check.error ?? 'occupied'], 'bad');
      return false;
    }

    const instance = makeInstance(def.id, x, y, tool.rotation, city.month);
    instance.constructionProgress = 1;
    city.buildings.push(instance);
    city.money -= check.cost;

    set((s) => ({
      ...commit(city),
      freshIds: [...s.freshIds.slice(-40), instance.instanceId],
      // Roads are drawn in strokes, so the road tool stays armed. Everything
      // else disarms, because placing two hospitals by accident is a real cost.
      tool: def.id === 'road' || def.category === 'decoration' ? s.tool : { kind: 'none' },
    }));
    return true;
  },

  bulldozeAt: (x, y) => {
    const state = get();
    const city = state.city;
    const tile = city.tiles[index(x, y, city.width)];
    if (!tile?.buildingId) return false;

    const target = city.buildings.find((b) => b.instanceId === tile.buildingId);
    if (!target) return false;
    const def = tryGetDefinition(target.definitionId);
    if (def?.unique) {
      state.pushToast('City hall stays where it is.', 'bad');
      return false;
    }

    // Half the build price back, because demolition should be a correction the
    // player is willing to make rather than a punishment they avoid.
    const refund = Math.round((def?.cost ?? 0) * 0.5);
    city.buildings = city.buildings.filter((b) => b.instanceId !== target.instanceId);
    city.money += refund;

    set((s) => ({
      ...commit(city),
      selectedId: s.selectedId === target.instanceId ? null : s.selectedId,
    }));
    return true;
  },

  buyParcelAt: (x, y) => {
    const state = get();
    const city = state.city;
    const parcel = parcelIndexFor(x, y, city.width);
    if (city.ownedParcels.includes(parcel)) return false;
    if (!purchasableParcels(city).includes(parcel)) {
      state.pushToast('You can only buy land next to what you own.', 'bad');
      return false;
    }
    const price = parcelPrice(city.ownedParcels.length, buildableTilesIn(city, parcel));
    if (city.money < price) {
      state.pushToast(`That parcel costs ${price}.`, 'bad');
      return false;
    }
    city.money -= price;
    unlockParcel(city, parcel);
    set(commit(city));
    state.pushToast('New land bought.', 'good');
    return true;
  },

  claimObjective: (id) => {
    const state = get();
    const city = state.city;
    const objective = city.objectives.find((o) => o.id === id);
    const def = objectiveDefinition(id);
    if (!objective || !def || !objective.complete || objective.claimed) return;
    objective.claimed = true;
    city.money += def.reward;
    set(commit(city));
    state.pushToast(`${def.title} — reward ${def.reward}`, 'good');
  },

  advance: () => {
    const state = get();
    const city = state.city;
    const rng = makeRng(city.seed + city.month * 7919);

    advanceMonth(city, rng);

    if (city.month % EVENT_INTERVAL === 0) {
      const event = rollEvent(city, rng);
      if (event) {
        city.events = [...city.events, event];
        state.pushToast(event.title, event.tone);
        recomputeDerived(city);
      }
    }

    city.objectives = evaluateObjectives(city);
    set({ city: { ...city } });
    saveCity(city);
  },

  save: () => saveCity(get().city),

  reset: () => {
    clearSave();
    const city = createCity();
    set({
      ...commit(city),
      tool: { kind: 'none' },
      selectedId: null,
      freshIds: [],
    });
  },

  pushToast: (text, tone) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismissToast(id), 3200);
    }
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** The month clock. One number, its own store — see the header note. */
export const useIsleworksClock = create<{ progress: number; set: (p: number) => void }>((set) => ({
  progress: 0,
  set: (progress) => set({ progress }),
}));

/** Convenience selectors used in more than one panel. */
export function selectedBuilding(state: IsleworksState) {
  if (!state.selectedId) return null;
  const instance = state.city.buildings.find((b) => b.instanceId === state.selectedId);
  if (!instance) return null;
  const def = tryGetDefinition(instance.definitionId);
  if (!def) return null;
  return { instance, def, tiles: instanceTiles(instance, def) };
}

export type { IsleworksState };
