/**
 * Saving, loading, and the migration off the old game.
 *
 * The save is a plain object: sets become arrays, everything else is already
 * JSON. There is no compression and no versioned migration chain beyond v1→v2,
 * because a save that is readable in a browser console is a save you can fix
 * when something goes wrong at three in the morning.
 */
import { useEffect } from 'react';
import type { GameState, LegacySaveV1, SaveData, SourceId } from './types';
import { useTempleStore } from './store';
import { createInitialState } from './store';
import { ZERO_SOURCES } from './data/sources';
import { createGarden, emptyPlots, GARDEN_SIZE } from './minigames/garden';
import { createChoir } from './minigames/choir';
import { createExchange } from './minigames/exchange';
import { createHours } from './minigames/hours';
import { createManna } from './minigames/manna';
import { computeGraceEarned } from './engine';

const LOCAL_KEY = 'temple_of_joy_save_v2';
export const SAVE_VERSION = 2 as const;

/* ══════════════════════════════════════════════════════════════════════════
   Serialising
   ══════════════════════════════════════════════════════════════════════════ */

export function stateToSave(state: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    joy: state.joy,
    runJoy: state.runJoy,
    lifetimeJoy: state.lifetimeJoy,
    peakJoy: state.peakJoy,
    sources: { ...state.sources },
    sourceLevels: { ...state.sourceLevels },
    sourceEarnings: { ...state.sourceEarnings },
    blessings: [...state.blessings],
    trophies: [...state.trophies],
    grace: state.grace,
    graceSpent: state.graceSpent,
    graceEarned: state.graceEarned,
    legacy: [...state.legacy],
    ascensions: state.ascensions,
    keepsakes: [...state.keepsakes],
    manna: state.manna,
    totalTouches: state.totalTouches,
    halosCaught: state.halosCaught,
    haloStreak: state.haloStreak,
    rapture: state.rapture,
    sinners: state.sinners,
    sinnersStruck: state.sinnersStruck,
    sinnerHarvest: state.sinnerHarvest,
    buffs: state.buffs,
    garden: state.garden,
    choir: state.choir,
    exchange: state.exchange,
    hours: state.hours,
    lastSaved: Date.now(),
    playtime: state.playtime,
    runPlaytime: state.runPlaytime,
    theme: state.theme,
    numberFormat: state.numberFormat,
    soundEnabled: state.soundEnabled,
    musicVolume: state.musicVolume,
    sfxVolume: state.sfxVolume,
    stewardEnabled: state.stewardEnabled,
    confirmAscend: state.confirmAscend,
    reducedFlourish: state.reducedFlourish,
    buyQty: state.buyQty,
  };
}

export function saveToState(save: SaveData): Partial<GameState> {
  const base = createInitialState();
  return {
    joy: num(save.joy),
    runJoy: num(save.runJoy),
    lifetimeJoy: num(save.lifetimeJoy),
    peakJoy: num(save.peakJoy),
    sources: { ...ZERO_SOURCES, ...(save.sources ?? {}) } as Record<SourceId, number>,
    sourceLevels: { ...ZERO_SOURCES, ...(save.sourceLevels ?? {}) } as Record<SourceId, number>,
    sourceEarnings: { ...ZERO_SOURCES, ...(save.sourceEarnings ?? {}) } as Record<SourceId, number>,
    blessings: new Set(save.blessings ?? []),
    trophies: new Set(save.trophies ?? []),
    grace: num(save.grace),
    graceSpent: num(save.graceSpent),
    graceEarned: num(save.graceEarned),
    legacy: new Set(save.legacy ?? []),
    ascensions: num(save.ascensions),
    keepsakes: save.keepsakes ?? [],
    manna: { ...createManna(), ...(save.manna ?? {}) },
    totalTouches: num(save.totalTouches),
    halosCaught: num(save.halosCaught),
    haloStreak: num(save.haloStreak),
    rapture: Math.max(0, Math.min(3, num(save.rapture))),
    sinners: save.sinners ?? [],
    sinnersStruck: num(save.sinnersStruck),
    sinnerHarvest: num(save.sinnerHarvest),
    buffs: save.buffs ?? [],
    garden: reviveGarden(save.garden),
    choir: { ...createChoir(), ...(save.choir ?? {}) },
    exchange: reviveExchange(save.exchange),
    hours: { ...createHours(), ...(save.hours ?? {}) },
    lastSaved: num(save.lastSaved) || Date.now(),
    playtime: num(save.playtime),
    runPlaytime: num(save.runPlaytime),
    theme: save.theme ?? base.theme,
    numberFormat: save.numberFormat ?? base.numberFormat,
    soundEnabled: save.soundEnabled ?? true,
    musicVolume: clamp01(save.musicVolume ?? base.musicVolume),
    sfxVolume: clamp01(save.sfxVolume ?? base.sfxVolume),
    stewardEnabled: save.stewardEnabled ?? false,
    confirmAscend: save.confirmAscend ?? true,
    reducedFlourish: save.reducedFlourish ?? false,
    buyQty: save.buyQty ?? 1,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, num(v)));
}

/**
 * A garden from an older build may have a shorter plot array. Rehydrating it
 * to the full 36 rather than trusting the save is what stops a bad write from
 * turning into an index crash three sessions later.
 */
function reviveGarden(saved: GameState['garden'] | undefined): GameState['garden'] {
  const base = createGarden();
  if (!saved) return base;
  const plots = emptyPlots();
  (saved.plots ?? []).slice(0, GARDEN_SIZE).forEach((plot, i) => {
    if (plot && typeof plot === 'object') plots[i] = { ...plots[i]!, ...plot };
  });
  return { ...base, ...saved, plots };
}

function reviveExchange(saved: GameState['exchange'] | undefined): GameState['exchange'] {
  const base = createExchange();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    goods: { ...base.goods, ...(saved.goods ?? {}) },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Migration from the old game
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The v1 temple had a different set of sources, three parallel prestige
 * currencies and no minigames. Nothing about its structure survives the
 * rewrite — but the *time* someone put into it does, and throwing that away
 * would be the wrong call.
 *
 * So a v1 save is read for its lifetime happiness and converted into Grace on
 * the new curve, plus its playtime and its settings. The player restarts with
 * a Ladder they did not have to climb twice.
 */
export function migrateV1(old: LegacySaveV1): Partial<GameState> {
  const lifetime = num(old.lifetimeHappiness);
  // The old economy ran roughly three orders of magnitude hotter than this one
  // at the same point on the curve, so the transfer is deliberately
  // conservative: it should feel like a gift, not like a skipped game.
  const equivalent = lifetime / 1_000;
  const grace = Math.max(
    computeGraceEarned(equivalent),
    // Anyone who transcended in the old game gets at least a rung per reset.
    num(old.prestigeCount) * 2 + num(old.ascensionCount) * 25,
  );

  return {
    grace,
    graceEarned: grace,
    ascensions: num(old.prestigeCount),
    playtime: num(old.totalPlaytime),
    totalTouches: num(old.totalClicks),
    theme: old.theme === 'light' ? 'dawn' : 'vespers',
    numberFormat: old.numberFormat === 'scientific' ? 'scientific' : 'named',
    soundEnabled: old.soundEnabled ?? true,
    musicVolume: clamp01(old.musicVolume ?? 0.35),
    sfxVolume: clamp01(old.sfxVolume ?? 0.5),
  };
}

/**
 * Read whatever is on the server or in storage and normalise it to v2 state.
 *
 * The two save shapes have nothing structural in common, so this sniffs rather
 * than casting to an intersection: `SaveData & LegacySaveV1` narrows to `never`
 * (v2's `version` is the literal 2, v1's is `number | undefined`) and every
 * field read off it becomes an error.
 */
export function readSave(raw: unknown): Partial<GameState> | null {
  if (!raw || typeof raw !== 'object') return null;
  const probe = raw as { version?: unknown; lifetimeHappiness?: unknown };
  if (probe.version === SAVE_VERSION) return saveToState(raw as SaveData);
  // Anything that is not v2 but carries the old currency is a v1 save.
  if (typeof probe.lifetimeHappiness === 'number') return migrateV1(raw as LegacySaveV1);
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Storage
   ══════════════════════════════════════════════════════════════════════════ */

export function saveLocal(state: GameState): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stateToSave(state)));
  } catch {
    // Private browsing, quota, a disabled storage API — none of which should
    // interrupt a game that also saves to the server.
  }
}

export function loadLocal(): unknown {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveToServer(state: GameState): Promise<void> {
  await fetch('/api/temple-of-joy/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saveData: stateToSave(state) }),
  });
}

export async function loadFromServer(): Promise<unknown> {
  try {
    const res = await fetch('/api/temple-of-joy/save');
    if (!res.ok) return null;
    const json = (await res.json()) as { saveData?: unknown };
    return json.saveData ?? null;
  } catch {
    return null;
  }
}

/* ── Import / export ─────────────────────────────────────────────────────── */

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(stateToSave(state)))));
}

export function importSave(encoded: string): Partial<GameState> | null {
  try {
    return readSave(JSON.parse(decodeURIComponent(escape(atob(encoded.trim())))));
  } catch {
    return null;
  }
}

/* ── Autosave ────────────────────────────────────────────────────────────── */

/**
 * Writes to the server on an interval and to local storage as a fallback. The
 * local write also happens on every server success, so a session that loses
 * its connection mid-play still has something to come back to.
 */
export function useAutoSave(intervalMs = 30_000): void {
  useEffect(() => {
    const flush = () => {
      const state = useTempleStore.getState();
      if (!state.initialized) return;
      saveLocal(state);
      saveToServer(state).catch(() => {});
      useTempleStore.setState({ lastSaved: Date.now() });
    };

    const id = window.setInterval(flush, intervalMs);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [intervalMs]);
}
