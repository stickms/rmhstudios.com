import { useEffect } from 'react';
import type { GameState, SaveData } from './types';
import { computeTotalHPS } from './engine';
import { useTempleStore } from './store';

// ─── Constants ────────────────────────────────────────────────────────────────

const SAVE_KEY = 'temple_of_joy_save';
const SAVE_VERSION = 1;
const OFFLINE_EFFICIENCY = 0.5;
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;           // 8 hours
const OFFLINE_CAP_WITH_SAINT = 16 * 60 * 60;       // 16 hours with Saint's Patience wheel upgrade

// ─── Serialisation ────────────────────────────────────────────────────────────

export function stateToSaveData(state: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    happiness: state.happiness,
    lifetimeHappiness: state.lifetimeHappiness,
    peakHappiness: state.peakHappiness,
    peakKarma: state.peakKarma,
    karma: state.karma,
    blissShards: state.blissShards,
    buildings: { ...state.buildings },
    upgrades: [...state.upgrades],
    activeRelics: [...state.activeRelics],
    maxRelicSlots: state.maxRelicSlots,
    prestigeCount: state.prestigeCount,
    wheelPurchased: [...state.wheelPurchased],
    samsaraGiftStacks: state.samsaraGiftStacks,
    lastSaved: Date.now(),
    totalPlaytime: state.totalPlaytime,
    totalClicks: state.totalClicks,
    totalPilgrimages: state.totalPilgrimages,
    totalVibeChecks: state.totalVibeChecks,
    totalEventsResolved: state.totalEventsResolved,
    achievements: [...state.achievements],
    milestones: [...state.milestones],
    baselineHappiness: state.baselineHappiness,
    pilgrimageCooldown: state.pilgrimageCooldown,
    autoBuyTimer: state.autoBuyTimer,
    permanentHPSBonus: state.permanentHPSBonus,
    permanentHPCBonus: state.permanentHPCBonus,
    theme: state.theme,
    numberFormat: state.numberFormat,
    buildingBuyQty: state.buildingBuyQty,
    soundEnabled: state.soundEnabled,
    soundVolume: state.soundVolume,
  };
}

export function saveDataToState(save: SaveData, baseState: GameState): Partial<GameState> {
  return {
    happiness: save.happiness ?? 0,
    lifetimeHappiness: save.lifetimeHappiness ?? 0,
    peakHappiness: save.peakHappiness ?? 0,
    peakKarma: save.peakKarma ?? 0,
    karma: save.karma ?? 0,
    blissShards: save.blissShards ?? 0,
    buildings: { ...baseState.buildings, ...(save.buildings ?? {}) },
    upgrades: new Set(save.upgrades ?? []),
    activeRelics: save.activeRelics ?? [],
    maxRelicSlots: save.maxRelicSlots ?? 5,
    prestigeCount: save.prestigeCount ?? 0,
    wheelPurchased: new Set(save.wheelPurchased ?? []),
    samsaraGiftStacks: save.samsaraGiftStacks ?? 0,
    lastSaved: save.lastSaved ?? Date.now(),
    totalPlaytime: save.totalPlaytime ?? 0,
    totalClicks: save.totalClicks ?? 0,
    totalPilgrimages: save.totalPilgrimages ?? 0,
    totalVibeChecks: save.totalVibeChecks ?? 0,
    totalEventsResolved: save.totalEventsResolved ?? 0,
    achievements: new Set(save.achievements ?? []),
    milestones: new Set(save.milestones ?? []),
    baselineHappiness: save.baselineHappiness ?? 0,
    pilgrimageCooldown: save.pilgrimageCooldown ?? 0,
    autoBuyTimer: save.autoBuyTimer ?? 30,
    permanentHPSBonus: save.permanentHPSBonus ?? 0,
    permanentHPCBonus: save.permanentHPCBonus ?? 0,
    theme: save.theme ?? 'dark',
    numberFormat: save.numberFormat ?? 'abbreviated',
    buildingBuyQty: save.buildingBuyQty ?? 1,
    soundEnabled: save.soundEnabled ?? false,
    soundVolume: save.soundVolume ?? 0.5,
  };
}

// ─── Local Storage ────────────────────────────────────────────────────────────

export function saveToLocalStorage(state: GameState): void {
  try {
    const saveData = stateToSaveData(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  } catch {
    // Silently ignore storage failures (private browsing, quota exceeded, etc.)
  }
}

export function loadFromLocalStorage(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Offline Progress ─────────────────────────────────────────────────────────

export function computeOfflineProgress(
  state: GameState,
  nowMs: number
): { happiness: number; seconds: number } {
  const elapsedSecs = (nowMs - state.lastSaved) / 1000;
  const hasSaintWheel = state.wheelPurchased.has('saintsPatience');
  const capSecs = hasSaintWheel ? OFFLINE_CAP_WITH_SAINT : OFFLINE_CAP_SECONDS;
  const effectiveSecs = Math.min(elapsedSecs, capSecs);
  if (effectiveSecs < 30) return { happiness: 0, seconds: 0 };
  const hps = computeTotalHPS(state);
  // theLongView wheel: use sqrt formula for offline income (diminishing returns)
  const happiness = state.wheelPurchased.has('theLongView')
    ? hps * Math.sqrt(effectiveSecs) * OFFLINE_EFFICIENCY
    : hps * effectiveSecs * OFFLINE_EFFICIENCY;
  return { happiness, seconds: effectiveSecs };
}

// ─── Import / Export ──────────────────────────────────────────────────────────

export function exportSave(state: GameState): string {
  return btoa(JSON.stringify(stateToSaveData(state)));
}

export function importSave(encoded: string): SaveData | null {
  try {
    const decoded = atob(encoded);
    const parsed = JSON.parse(decoded) as SaveData;
    if (typeof parsed.version !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Server Persistence ───────────────────────────────────────────────────────

export async function saveToServer(state: GameState): Promise<void> {
  await fetch('/api/temple-of-joy/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saveData: stateToSaveData(state) }),
  });
}

export async function loadFromServer(): Promise<SaveData | null> {
  try {
    const res = await fetch('/api/temple-of-joy/save');
    if (!res.ok) return null;
    const json = await res.json() as { saveData: SaveData | null };
    return json.saveData ?? null;
  } catch {
    return null;
  }
}

// ─── Auto-Save Hook ───────────────────────────────────────────────────────────

export function useAutoSave(interval = 30_000): void {
  useEffect(() => {
    const save = () => {
      const state = useTempleStore.getState();
      // Primary: server-side (silent fallback to localStorage)
      saveToServer(state).catch(() => saveToLocalStorage(state));
    };

    const id = setInterval(save, interval);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [interval]);
}
