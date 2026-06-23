/**
 * RMH Coding Simulator — save/load, offline catch-up, import/export.
 *
 * Persistence is local-only (localStorage + a copy-paste export string). The
 * game is single-player and stateless on the server, so there's no DB schema to
 * own; this keeps the build self-contained.
 */

import type { GameState, SaveData } from './types';
import { totalCps, offlineCapSeconds, offlineEfficiency } from './engine';

const SAVE_KEY = 'rmh_coding_simulator_save';
const SAVE_VERSION = 1;

export function stateToSave(s: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    loc: s.loc,
    lifetimeLoc: s.lifetimeLoc,
    totalLoc: s.totalLoc,
    reputation: s.reputation,
    reputationEarned: s.reputationEarned,
    equity: s.equity,
    equityEarned: s.equityEarned,
    generators: { ...s.generators },
    upgrades: [...s.upgrades],
    skills: [...s.skills],
    perks: [...s.perks],
    achievements: [...s.achievements],
    totalClicks: s.totalClicks,
    handmadeLoc: s.handmadeLoc,
    shipCount: s.shipCount,
    ascensionCount: s.ascensionCount,
    goldenClicks: s.goldenClicks,
    aiCalls: s.aiCalls,
    playtime: s.playtime,
    startedAt: s.startedAt,
    lastSaved: Date.now(),
    numberFormat: s.numberFormat,
    buyQty: s.buyQty,
    soundEnabled: s.soundEnabled,
  };
}

export function applySaveToState(save: SaveData, base: GameState): Partial<GameState> {
  return {
    loc: save.loc ?? 0,
    lifetimeLoc: save.lifetimeLoc ?? 0,
    totalLoc: save.totalLoc ?? 0,
    reputation: save.reputation ?? 0,
    reputationEarned: save.reputationEarned ?? 0,
    equity: save.equity ?? 0,
    equityEarned: save.equityEarned ?? 0,
    generators: { ...base.generators, ...(save.generators ?? {}) },
    upgrades: save.upgrades ?? [],
    skills: save.skills ?? [],
    perks: save.perks ?? [],
    achievements: save.achievements ?? [],
    totalClicks: save.totalClicks ?? 0,
    handmadeLoc: save.handmadeLoc ?? 0,
    shipCount: save.shipCount ?? 0,
    ascensionCount: save.ascensionCount ?? 0,
    goldenClicks: save.goldenClicks ?? 0,
    aiCalls: save.aiCalls ?? 0,
    playtime: save.playtime ?? 0,
    startedAt: save.startedAt ?? Date.now(),
    lastSaved: save.lastSaved ?? Date.now(),
    numberFormat: save.numberFormat ?? 'short',
    buyQty: save.buyQty ?? 1,
    soundEnabled: save.soundEnabled ?? true,
  };
}

export function saveToLocalStorage(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(stateToSave(s)));
  } catch {
    // Private browsing / quota — ignore.
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

export function clearLocalSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// ─── Offline progress ─────────────────────────────────────────────────────────

/** LoC earned while away, given the last-saved timestamp. */
export function computeOffline(s: GameState, nowMs: number): { loc: number; seconds: number } {
  const elapsed = (nowMs - s.lastSaved) / 1000;
  if (elapsed < 30) return { loc: 0, seconds: 0 };
  const capped = Math.min(elapsed, offlineCapSeconds(s));
  const loc = totalCps(s) * capped * offlineEfficiency(s);
  return { loc, seconds: capped };
}

// ─── Import / export ──────────────────────────────────────────────────────────

export function exportSave(s: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(stateToSave(s)))));
}

export function importSave(encoded: string): SaveData | null {
  try {
    const decoded = decodeURIComponent(escape(atob(encoded.trim())));
    const parsed = JSON.parse(decoded) as SaveData;
    if (typeof parsed.version !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}
