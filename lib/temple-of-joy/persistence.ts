import { useEffect } from 'react';
import type { GameState, SaveData } from './types';
import { computeTotalHPS, computeAscensionOfflineBonus } from './engine';
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
    runHappiness: state.runHappiness,
    peakHappiness: state.peakHappiness,
    peakKarma: state.peakKarma,
    karma: state.karma,
    blissShards: state.blissShards,
    sources: { ...state.sources },
    upgrades: [...state.upgrades],
    activeRelics: [...state.activeRelics],
    maxRelicSlots: state.maxRelicSlots,
    equippedRelicsHistory: [...state.equippedRelicsHistory],
    prestigeCount: state.prestigeCount,
    wheelPurchased: [...state.wheelPurchased],
    samsaraGiftStacks: state.samsaraGiftStacks,
    radiance: state.radiance,
    lifetimeRadiance: state.lifetimeRadiance,
    ascensionCount: state.ascensionCount,
    ascensionUpgrades: [...state.ascensionUpgrades],
    completedObjectives: [...state.completedObjectives],
    lastSaved: Date.now(),
    totalPlaytime: state.totalPlaytime,
    runPlaytime: state.runPlaytime,
    totalClicks: state.totalClicks,
    totalPilgrimages: state.totalPilgrimages,
    totalVibeChecks: state.totalVibeChecks,
    totalEventsResolved: state.totalEventsResolved,
    totalRituals: state.totalRituals,
    totalOfferings: state.totalOfferings,
    achievements: [...state.achievements],
    milestones: [...state.milestones],
    pilgrimageStreak: state.pilgrimageStreak,
    epicurusApprovedCount: state.epicurusApprovedCount,
    baselineHappiness: state.baselineHappiness,
    pilgrimageCooldown: state.pilgrimageCooldown,
    pilgrimageActive: state.pilgrimageActive,
    pilgrimageTimer: state.pilgrimageTimer,
    autoBuyTimer: state.autoBuyTimer,
    permanentHPSBonus: state.permanentHPSBonus,
    permanentHPCBonus: state.permanentHPCBonus,
    theme: state.theme,
    numberFormat: state.numberFormat,
    sourceBuyQty: state.sourceBuyQty,
    soundEnabled: state.soundEnabled,
    musicVolume: state.musicVolume,
    sfxVolume: state.sfxVolume,
    autoBuyEnabled: state.autoBuyEnabled,
    emberSelections: [...state.emberSelections],
  };
}

export function saveDataToState(save: SaveData, baseState: GameState): Partial<GameState> {
  // Backwards compat: old saves used 'buildings' instead of 'sources'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = save as any;
  const savedSources = save.sources ?? (legacy.buildings as Record<string, number> | undefined) ?? {};
  const savedBuyQty = save.sourceBuyQty ?? (legacy.buildingBuyQty as 1 | 10 | 100 | 'max' | undefined) ?? 1;
  const savedMusicVol = save.musicVolume ?? (legacy.soundVolume as number | undefined) ?? 0.5;
  const savedSfxVol = save.sfxVolume ?? (legacy.soundVolume as number | undefined) ?? 0.5;

  return {
    happiness: save.happiness ?? 0,
    lifetimeHappiness: save.lifetimeHappiness ?? 0,
    runHappiness: save.runHappiness ?? 0,
    peakHappiness: save.peakHappiness ?? 0,
    peakKarma: save.peakKarma ?? 0,
    karma: save.karma ?? 0,
    blissShards: save.blissShards ?? 0,
    sources: { ...baseState.sources, ...savedSources },
    upgrades: new Set(save.upgrades ?? []),
    activeRelics: save.activeRelics ?? [],
    maxRelicSlots: save.maxRelicSlots ?? 5,
    equippedRelicsHistory: save.equippedRelicsHistory ?? [],
    prestigeCount: save.prestigeCount ?? 0,
    wheelPurchased: new Set(save.wheelPurchased ?? []),
    samsaraGiftStacks: save.samsaraGiftStacks ?? 0,
    radiance: save.radiance ?? 0,
    lifetimeRadiance: save.lifetimeRadiance ?? 0,
    ascensionCount: save.ascensionCount ?? 0,
    ascensionUpgrades: new Set(save.ascensionUpgrades ?? []),
    completedObjectives: new Set(save.completedObjectives ?? []),
    lastSaved: save.lastSaved ?? Date.now(),
    totalPlaytime: save.totalPlaytime ?? 0,
    runPlaytime: save.runPlaytime ?? 0,
    totalClicks: save.totalClicks ?? 0,
    totalPilgrimages: save.totalPilgrimages ?? 0,
    totalVibeChecks: save.totalVibeChecks ?? 0,
    totalEventsResolved: save.totalEventsResolved ?? 0,
    totalRituals: save.totalRituals ?? 0,
    totalOfferings: save.totalOfferings ?? 0,
    achievements: new Set(save.achievements ?? []),
    milestones: new Set(save.milestones ?? []),
    pilgrimageStreak: save.pilgrimageStreak ?? 0,
    epicurusApprovedCount: save.epicurusApprovedCount ?? 0,
    baselineHappiness: save.baselineHappiness ?? 0,
    pilgrimageCooldown: save.pilgrimageCooldown ?? 0,
    pilgrimageActive: save.pilgrimageActive ?? false,
    pilgrimageTimer: save.pilgrimageTimer ?? 0,
    autoBuyTimer: save.autoBuyTimer ?? 30,
    permanentHPSBonus: save.permanentHPSBonus ?? 0,
    permanentHPCBonus: save.permanentHPCBonus ?? 0,
    theme: save.theme ?? 'dark',
    numberFormat: save.numberFormat ?? 'abbreviated',
    sourceBuyQty: savedBuyQty,
    soundEnabled: save.soundEnabled ?? true,
    musicVolume: savedMusicVol,
    sfxVolume: savedSfxVol,
    autoBuyEnabled: save.autoBuyEnabled ?? true,
    emberSelections: save.emberSelections ?? [],
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
): {
  happiness: number;
  seconds: number;
  pilgrimageActive: boolean;
  pilgrimageTimer: number;
  pilgrimageCooldown: number;
  pilgrimageBurstHP: number;
  totalPilgrimages: number;
} {
  const elapsedSecs = (nowMs - state.lastSaved) / 1000;
  const hasSaintWheel = state.wheelPurchased.has('saintsPatience');
  const capSecs = hasSaintWheel ? OFFLINE_CAP_WITH_SAINT : OFFLINE_CAP_SECONDS;
  const effectiveSecs = Math.min(elapsedSecs, capSecs);

  // Process pilgrimage timers offline
  let pilgrimageActive = state.pilgrimageActive;
  let pilgrimageTimer = state.pilgrimageTimer;
  let pilgrimageCooldown = Math.max(0, state.pilgrimageCooldown - effectiveSecs);
  let pilgrimageBurstHP = 0;
  let totalPilgrimages = state.totalPilgrimages;

  if (pilgrimageActive && effectiveSecs > 0) {
    pilgrimageTimer -= effectiveSecs;
    if (pilgrimageTimer <= 0) {
      // Pilgrimage completed offline — grant burst
      const overshoot = -pilgrimageTimer; // how far past 0 the timer went
      pilgrimageActive = false;
      pilgrimageTimer = 0;
      pilgrimageCooldown = Math.max(0, 900 - overshoot); // 15 min cooldown minus overshoot
      totalPilgrimages += 1;
      // Pilgrimage burst: 5 min × HPS × relic bonuses
      const hps = computeTotalHPS(state);
      const stuffedPillowBonus = state.activeRelics.includes('stuffedPillow') ? 1.5 : 1;
      const nappingCatBonus = state.activeRelics.includes('nappingCat') ? 2 : 1;
      pilgrimageBurstHP = 5 * 60 * hps * stuffedPillowBonus * nappingCatBonus;
    }
  }

  if (effectiveSecs < 30) return {
    happiness: 0, seconds: 0,
    pilgrimageActive, pilgrimageTimer: Math.max(0, pilgrimageTimer),
    pilgrimageCooldown, pilgrimageBurstHP, totalPilgrimages,
  };

  const hps = computeTotalHPS(state);
  // eternalNap relic: offline progress at 100% efficiency (as if actively playing).
  // Ascension upgrades add a permanent offline-efficiency bonus on top (capped at 100%).
  const baseEfficiency = state.activeRelics.includes('eternalNap') ? 1.0 : OFFLINE_EFFICIENCY;
  const efficiency = Math.min(1.0, baseEfficiency + computeAscensionOfflineBonus(state));
  // theLongView wheel: uncapped offline income with diminishing returns (no linear cap)
  let happiness: number;
  if (state.wheelPurchased.has('theLongView')) {
    // Use full elapsed time (bypass cap) with pow(0.85) diminishing curve
    const uncapped = elapsedSecs;
    happiness = hps * Math.pow(uncapped, 0.85) * efficiency;
  } else {
    happiness = hps * effectiveSecs * efficiency;
  }
  return {
    happiness: happiness + pilgrimageBurstHP,
    seconds: effectiveSecs,
    pilgrimageActive, pilgrimageTimer: Math.max(0, pilgrimageTimer),
    pilgrimageCooldown, pilgrimageBurstHP, totalPilgrimages,
  };
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
