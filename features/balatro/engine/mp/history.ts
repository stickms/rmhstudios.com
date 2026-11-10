/**
 * Local match history (HUD-15, D-37): wins, losses, matches and the days
 * played, kept in this browser's localStorage. It feeds the avatar goals the
 * MP settings tab computes (WS10) through the bridge's `history` message.
 * Draws are not counted as wins or losses (HUD-15); a practice counts as a
 * game but not as a PvP game.
 *
 * Every storage access is guarded: a private window or blocked site data
 * gives an empty history, never an error.
 */

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, or null when the page cannot use it. */
export function localKv(): KeyValue | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValue }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/** An in-memory KeyValue (tests, and a fallback when storage throws). */
export function memoryKv(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function kvGet(kv: KeyValue | null, key: string): string | null {
  try {
    return kv?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function kvSet(kv: KeyValue | null, key: string, value: string | null): void {
  try {
    if (value === null) kv?.removeItem(key);
    else kv?.setItem(key, value);
  } catch {
    /* storage refused: history is a convenience */
  }
}

export const HISTORY_KEY = 'rmh-balatro-mp-history';
const MAX_DAYS = 400;

export interface MatchHistory {
  wins: number;
  losses: number;
  games: number;
  pvpGames: number;
  /** Current win streak. */
  streak: number;
  /** Distinct days played (count). */
  days: number;
}

interface Stored {
  wins: number;
  losses: number;
  games: number;
  pvpGames: number;
  streak: number;
  dayList: string[];
}

const EMPTY: Stored = { wins: 0, losses: 0, games: 0, pvpGames: 0, streak: 0, dayList: [] };

function nonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function load(kv: KeyValue | null): Stored {
  const raw = kvGet(kv, HISTORY_KEY);
  if (!raw) return { ...EMPTY, dayList: [] };
  try {
    const o = JSON.parse(raw) as Partial<Stored>;
    return {
      wins: nonNeg(o.wins),
      losses: nonNeg(o.losses),
      games: nonNeg(o.games),
      pvpGames: nonNeg(o.pvpGames),
      streak: nonNeg(o.streak),
      dayList: Array.isArray(o.dayList)
        ? o.dayList.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-MAX_DAYS)
        : [],
    };
  } catch {
    return { ...EMPTY, dayList: [] };
  }
}

function view(s: Stored): MatchHistory {
  return { wins: s.wins, losses: s.losses, games: s.games, pvpGames: s.pvpGames, streak: s.streak, days: s.dayList.length };
}

export function readHistory(kv: KeyValue | null): MatchHistory {
  return view(load(kv));
}

export type MatchResultKind = 'win' | 'lose' | 'draw' | 'practice';

/** Record one finished game; returns the new history. */
export function recordResult(kv: KeyValue | null, result: MatchResultKind, at: Date = new Date()): MatchHistory {
  const s = load(kv);
  s.games += 1;
  if (result !== 'practice') s.pvpGames += 1;
  if (result === 'win') {
    s.wins += 1;
    s.streak += 1;
  } else if (result === 'lose') {
    s.losses += 1;
    s.streak = 0;
  }
  const day = at.toISOString().slice(0, 10);
  if (!s.dayList.includes(day)) s.dayList = [...s.dayList, day].slice(-MAX_DAYS);
  kvSet(kv, HISTORY_KEY, JSON.stringify(s));
  return view(s);
}
